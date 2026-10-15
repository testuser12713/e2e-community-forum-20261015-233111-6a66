"""The worker's periodic enqueuer.

The worker enqueues its own periodic jobs: ``thread.hot_score`` every few
minutes and ``session.cleanup`` at a longer interval. The intervals are read
from the environment (``HOT_SCORE_INTERVAL`` and ``SESSION_CLEANUP_INTERVAL``,
declared in ``RUN.json``) inside :meth:`Scheduler.from_env`, never at import
time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from config import env_float
from engine import JOB_HOT_SCORE, JOB_SESSION_CLEANUP, enqueue_job, utcnow
from models import Job
from sqlalchemy import select
from sqlalchemy.orm import Session

DEFAULT_HOT_SCORE_INTERVAL_SECONDS = 300.0
DEFAULT_SESSION_CLEANUP_INTERVAL_SECONDS = 3600.0


@dataclass
class Scheduler:
    """Tracks when each periodic job was last enqueued."""

    hot_score_interval: float
    session_cleanup_interval: float
    _last_enqueued: dict[str, datetime] = field(default_factory=dict)

    @classmethod
    def from_env(cls) -> Scheduler:
        """Build a scheduler whose intervals come from the environment."""
        return cls(
            hot_score_interval=env_float("HOT_SCORE_INTERVAL", DEFAULT_HOT_SCORE_INTERVAL_SECONDS),
            session_cleanup_interval=env_float(
                "SESSION_CLEANUP_INTERVAL", DEFAULT_SESSION_CLEANUP_INTERVAL_SECONDS
            ),
        )

    def due_jobs(self, now: datetime | None = None) -> list[tuple[str, dict[str, Any]]]:
        """Return the ``(kind, payload)`` pairs whose interval has elapsed."""
        now = now or utcnow()
        due: list[tuple[str, dict[str, Any]]] = []
        if self._is_due(JOB_HOT_SCORE, now, self.hot_score_interval):
            due.append((JOB_HOT_SCORE, {"thread_ids": None}))
        if self._is_due(JOB_SESSION_CLEANUP, now, self.session_cleanup_interval):
            due.append((JOB_SESSION_CLEANUP, {}))
        return due

    def enqueue_due(self, db: Session, *, now: datetime | None = None) -> list[str]:
        """Enqueue the due periodic jobs inside the caller's transaction."""
        now = now or utcnow()
        enqueued: list[str] = []
        for kind, payload in self.due_jobs(now):
            if not self._has_outstanding(db, kind):
                enqueue_job(db, kind, payload)
                enqueued.append(kind)
            self._last_enqueued[kind] = now
        return enqueued

    def _is_due(self, kind: str, now: datetime, interval: float) -> bool:
        last = self._last_enqueued.get(kind)
        if last is None:
            return True
        return (now - last).total_seconds() >= interval

    @staticmethod
    def _has_outstanding(db: Session, kind: str) -> bool:
        stmt = (
            select(Job.id).where(Job.kind == kind, Job.status.in_(("pending", "running"))).limit(1)
        )
        return db.scalar(stmt) is not None
