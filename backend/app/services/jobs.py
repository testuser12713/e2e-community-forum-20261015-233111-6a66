"""Enqueueing jobs into the ``job`` table.

The API inserts inside the caller's writing transaction; the worker claims and
processes the rows.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Job

NOTIFICATION_CREATE = "notification.create"
THREAD_HOT_SCORE = "thread.hot_score"
SESSION_CLEANUP = "session.cleanup"

DEFAULT_MAX_ATTEMPTS = 5


def enqueue_job(
    db: Session,
    kind: str,
    payload: dict[str, Any] | None = None,
    run_at: datetime | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> Job:
    """Insert a pending job in the caller's transaction and return it."""
    job = Job(kind=kind, payload=payload or {}, max_attempts=max_attempts)
    if run_at is not None:
        job.run_at = run_at
    db.add(job)
    db.flush()
    return job
