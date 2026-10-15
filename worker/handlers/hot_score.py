"""Handler for the ``thread.hot_score`` job.

Recomputes the ``thread.hot_score`` column the API feed orders its 'Hot' ranking
by. The score decays with the age of the thread's last activity, so a newer
thread with fewer votes can outrank an older thread with more votes.

The whole recomputation is a single ``UPDATE ... SET hot_score = <expression>``:
the database evaluates the time-decaying formula for every affected row and no
thread is ever loaded into Python.

'Live thread' (the contract's notion) means the row is not soft-deleted
(``deleted_at IS NULL``). A locked thread is still readable and still appears in
the feed, so it stays live and keeps a current hot score; a soft-deleted thread
is excluded and keeps its last value.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from models import Thread
from sqlalchemy import func, update
from sqlalchemy.orm import Session

#: Hacker-News-style gravity: higher makes the ranking decay faster with age.
HOT_GRAVITY = 1.8
#: Added to the age so a brand-new thread does not divide by zero (or by ~0).
HOT_AGE_OFFSET_HOURS = 2.0
SECONDS_PER_HOUR = 3600.0


def handle(db: Session, payload: dict[str, Any]) -> None:
    """Recompute the hot score of the threads named in ``payload``.

    Payload: ``{"thread_ids": list[int] | None}`` — ``None`` means every live
    thread.
    """
    thread_ids = payload.get("thread_ids")

    now = datetime.now(UTC)
    age_hours = func.extract("epoch", now - Thread.last_activity_at) / SECONDS_PER_HOUR
    hot_score = func.greatest(Thread.score, 0) / func.power(
        age_hours + HOT_AGE_OFFSET_HOURS, HOT_GRAVITY
    )

    stmt = update(Thread).where(Thread.deleted_at.is_(None)).values(hot_score=hot_score)
    if thread_ids is not None:
        stmt = stmt.where(Thread.id.in_(thread_ids))
    db.execute(stmt)
