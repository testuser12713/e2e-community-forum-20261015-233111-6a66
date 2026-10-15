"""The SKIP LOCKED job engine.

Claims due ``job`` rows with ``SELECT ... FOR UPDATE SKIP LOCKED`` so that two
workers running at once never pick up the same row, runs each handler inside
the claim transaction (wrapped in a savepoint, so one failing job does not roll
back the others), marks completed jobs ``done`` and, when a handler raises,
increments ``attempts``, stores ``last_error`` and reschedules with a growing
backoff until ``max_attempts`` is reached, then marks the job ``failed``.
"""

from __future__ import annotations

import logging
import os
import socket
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from handlers import HANDLERS, Handler
from models import Job
from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_BACKOFF_BASE_SECONDS = 10.0
DEFAULT_BACKOFF_CAP_SECONDS = 3600.0

#: Job kinds declared in the shared contract.
JOB_NOTIFICATION_CREATE = "notification.create"
JOB_HOT_SCORE = "thread.hot_score"
JOB_SESSION_CLEANUP = "session.cleanup"


class UnknownJobKindError(LookupError):
    """Raised when a claimed job has no handler in the registry."""

    def __init__(self, kind: str) -> None:
        super().__init__(f"no handler registered for job kind {kind!r}")
        self.kind = kind


def utcnow() -> datetime:
    """Return the current time as a timezone-aware UTC datetime."""
    return datetime.now(UTC)


def build_worker_id() -> str:
    """A stable-enough identity for the ``locked_by`` column of a worker run."""
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


def compute_backoff(
    attempts: int,
    *,
    base: float = DEFAULT_BACKOFF_BASE_SECONDS,
    cap: float = DEFAULT_BACKOFF_CAP_SECONDS,
) -> float:
    """Exponential backoff in seconds for the given (1-based) attempt number."""
    if attempts < 1:
        attempts = 1
    return min(cap, base * (2 ** (attempts - 1)))


def enqueue_job(
    db: Session,
    kind: str,
    payload: dict[str, Any] | None = None,
    *,
    run_at: datetime | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> Job:
    """Insert a pending job inside the caller's transaction.

    The worker's own enqueuer (used by the scheduler); the API has its own copy
    under ``backend/app/services/jobs.py``.
    """
    job = Job(
        kind=kind,
        payload=payload if payload is not None else {},
        status="pending",
        attempts=0,
        max_attempts=max_attempts,
        run_at=run_at or utcnow(),
    )
    db.add(job)
    db.flush()
    return job


def claim_due_jobs(
    db: Session,
    worker_id: str,
    *,
    limit: int = 10,
    now: datetime | None = None,
) -> list[Job]:
    """Claim up to ``limit`` due jobs, locking the rows with SKIP LOCKED.

    The rows stay locked until the caller's transaction ends, so a concurrent
    worker skips them and never processes the same job twice. Claimed rows are
    marked ``running`` with ``locked_at``/``locked_by``.
    """
    now = now or utcnow()
    stmt = (
        select(Job)
        .where(Job.status == "pending", Job.run_at <= now)
        .order_by(Job.run_at, Job.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    jobs = list(db.scalars(stmt).all())
    for job in jobs:
        job.status = "running"
        job.locked_at = now
        job.locked_by = worker_id
    db.flush()
    return jobs


def _run_handler(db: Session, job: Job, registry: dict[str, Handler]) -> None:
    handler = registry.get(job.kind)
    if handler is None:
        raise UnknownJobKindError(job.kind)
    handler(db, dict(job.payload or {}))


def _record_failure(
    db: Session,
    job: Job,
    exc: Exception,
    *,
    now: datetime,
    backoff_base: float,
    backoff_cap: float,
) -> None:
    job.attempts = (job.attempts or 0) + 1
    job.last_error = f"{type(exc).__name__}: {exc}"[:2000]
    job.locked_at = None
    job.locked_by = None
    if job.attempts >= (job.max_attempts or DEFAULT_MAX_ATTEMPTS):
        job.status = "failed"
    else:
        job.status = "pending"
        delay = compute_backoff(job.attempts, base=backoff_base, cap=backoff_cap)
        job.run_at = now + timedelta(seconds=delay)


def process_due(
    db: Session,
    worker_id: str,
    *,
    handlers: dict[str, Handler] | None = None,
    limit: int = 10,
    now: datetime | None = None,
    backoff_base: float = DEFAULT_BACKOFF_BASE_SECONDS,
    backoff_cap: float = DEFAULT_BACKOFF_CAP_SECONDS,
) -> int:
    """Claim and process the currently due jobs in one transaction.

    Returns the number of jobs that were claimed. Successful handlers leave the
    job ``done``; a raising handler is retried with growing backoff until
    ``max_attempts`` and then left ``failed``. Either way the remaining jobs of
    the batch keep being processed.
    """
    registry = HANDLERS if handlers is None else handlers
    now = now or utcnow()
    jobs = claim_due_jobs(db, worker_id, limit=limit, now=now)
    for job in jobs:
        try:
            with db.begin_nested():
                _run_handler(db, job, registry)
        except Exception as exc:
            logger.warning("job %s (%s) failed: %s", job.id, job.kind, exc)
            _record_failure(
                db,
                job,
                exc,
                now=now,
                backoff_base=backoff_base,
                backoff_cap=backoff_cap,
            )
        else:
            job.status = "done"
            job.locked_at = None
            job.locked_by = None
    db.commit()
    return len(jobs)
