"""Thread ranking: the ``new``/``top``/``hot`` orderings and the hot score.

``new`` orders by creation time, ``top`` by score and ``hot`` by the
``thread.hot_score`` column the worker maintains. Every ordering is expressed
in SQL and gets ``thread.id`` as a final tie-breaker, so the result is stable
even when two threads share the primary sort key (AC-18).

``compute_hot_score`` is the time-decayed formula the worker recomputes with:
a fresh thread accumulates less age, so a newer thread with fewer votes can
outrank an older thread with more. ``recompute_hot_scores`` applies it to the
live threads in one pass.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models import Thread

SORT_NEW = "new"
SORT_TOP = "top"
SORT_HOT = "hot"
SORTS: tuple[str, ...] = (SORT_NEW, SORT_TOP, SORT_HOT)

# How fast a hot score decays: a thread loses half its weight roughly every
# few hours, so recency dominates a modest difference in votes.
_HOT_DECAY_EXPONENT = 1.8
_HOT_AGE_OFFSET_HOURS = 2.0


def order_by(sort: str) -> Sequence:
    """Return the SQL order-by expressions for a feed ``sort`` key.

    Unknown keys fall back to ``new``; the router validates the value against
    ``SORT_NEW``/``SORT_TOP``/``SORT_HOT`` before it reaches here.
    """
    if sort == SORT_TOP:
        return (Thread.score.desc(), Thread.id.desc())
    if sort == SORT_HOT:
        return (Thread.hot_score.desc(), Thread.id.desc())
    return (Thread.created_at.desc(), Thread.id.desc())


def _as_utc(value: datetime) -> datetime:
    """Attach UTC to a naive datetime (PostgreSQL always returns tz-aware)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def compute_hot_score(
    score: int,
    created_at: datetime,
    now: datetime | None = None,
) -> float:
    """Return the time-decayed hot score for a thread.

    ``(max(score, 0) + 1) / (age_hours + 2) ** 1.8`` — the ``+1`` keeps a
    zero-vote thread above nothing and the ``+2`` keeps a brand-new thread's
    denominator away from zero.
    """
    reference = _as_utc(now) if now is not None else datetime.now(UTC)
    created = _as_utc(created_at)
    age_hours = max((reference - created).total_seconds() / 3600.0, 0.0)
    weight = max(int(score), 0) + 1
    return weight / (age_hours + _HOT_AGE_OFFSET_HOURS) ** _HOT_DECAY_EXPONENT


def live_threads_stmt(thread_ids: Sequence[int] | None = None) -> Select:
    """Select every live thread, optionally narrowed to ``thread_ids``."""
    stmt = select(Thread).where(
        Thread.is_deleted.is_(False),
        Thread.is_removed.is_(False),
    )
    if thread_ids is not None:
        stmt = stmt.where(Thread.id.in_(list(thread_ids)))
    return stmt


def recompute_hot_scores(
    db: Session,
    thread_ids: Sequence[int] | None = None,
    now: datetime | None = None,
) -> list[int]:
    """Recompute ``hot_score`` for the live threads and return their ids.

    ``thread_ids`` of ``None`` means every live thread, exactly like the
    ``thread.hot_score`` job payload.
    """
    reference = _as_utc(now) if now is not None else datetime.now(UTC)
    updated: list[int] = []
    for thread in db.execute(live_threads_stmt(thread_ids)).scalars():
        thread.hot_score = compute_hot_score(thread.score, thread.created_at, reference)
        updated.append(thread.id)
    db.flush()
    return updated
