"""Thread subscription persistence.

A subscription is one ``subscription`` row per (user, thread). Every operation
is idempotent: subscribing twice never creates a second row, unsubscribing twice
is a no-op. Both write helpers commit their own transaction so a subsequent read
through a fresh session observes the change.

``get_subscriber_ids`` is the lookup the engagement service calls when a comment
is written, to fan out ``notification.create`` jobs to a thread's subscribers.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Subscription, Thread

__all__ = [
    "get_subscriber_ids",
    "is_subscribed",
    "subscribe",
    "thread_exists",
    "unsubscribe",
]

_UNIQUE_CONSTRAINT = "uq_subscription_user_thread"


def thread_exists(db: Session, thread_id: int) -> bool:
    """Return True when a thread with ``thread_id`` exists."""
    return db.get(Thread, thread_id) is not None


def is_subscribed(db: Session, *, user_id: int, thread_id: int) -> bool:
    """Return True when ``user_id`` is subscribed to ``thread_id``."""
    stmt = (
        select(Subscription.id)
        .where(
            Subscription.user_id == user_id,
            Subscription.thread_id == thread_id,
        )
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none() is not None


def subscribe(db: Session, *, user_id: int, thread_id: int) -> bool:
    """Idempotently subscribe; return True when a new row was created."""
    stmt = (
        pg_insert(Subscription)
        .values(user_id=user_id, thread_id=thread_id)
        .on_conflict_do_nothing(constraint=_UNIQUE_CONSTRAINT)
        .returning(Subscription.id)
    )
    created_id = db.execute(stmt).scalar_one_or_none()
    db.commit()
    return created_id is not None


def unsubscribe(db: Session, *, user_id: int, thread_id: int) -> bool:
    """Idempotently unsubscribe; return True when a row was removed."""
    stmt = (
        delete(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.thread_id == thread_id,
        )
        .returning(Subscription.id)
    )
    removed_id = db.execute(stmt).scalar_one_or_none()
    db.commit()
    return removed_id is not None


def get_subscriber_ids(
    db: Session,
    thread_id: int,
    *,
    exclude_user_id: int | None = None,
) -> list[int]:
    """Return the ids of every user subscribed to ``thread_id``.

    The engagement service uses this when a comment is written to enqueue the
    ``notification.create`` jobs for the thread's subscribers. An optional
    ``exclude_user_id`` omits one user (typically the comment's author).
    """
    stmt = select(Subscription.user_id).where(Subscription.thread_id == thread_id)
    if exclude_user_id is not None:
        stmt = stmt.where(Subscription.user_id != exclude_user_id)
    return list(db.execute(stmt).scalars().all())
