"""Notification queries and mutations.

Notification rows are produced by the worker from queued
``notification.create`` jobs (see ``app.services.engagement`` for the enqueue
side). This module serves a user's own notifications, counts the unread ones
and marks them read. A notification that belongs to another user does not exist
for the caller and answers 404.
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Notification, User
from app.pagination import make_page, paginate
from app.schemas.common import NotificationOut, UserOut

__all__ = [
    "list_notifications",
    "mark_all_read",
    "mark_read",
    "unread_count",
]


def _load_actors(db: Session, notifications: list[Notification]) -> dict[int, User]:
    """Load every actor referenced by ``notifications`` in a single query."""
    actor_ids = {row.actor_id for row in notifications if row.actor_id is not None}
    if not actor_ids:
        return {}
    users = db.execute(select(User).where(User.id.in_(actor_ids))).scalars().all()
    return {user.id: user for user in users}


def _to_out(notification: Notification, actors: dict[int, User]) -> NotificationOut:
    """Shape one row into the shared ``NotificationOut`` contract."""
    actor = actors.get(notification.actor_id) if notification.actor_id is not None else None
    return NotificationOut(
        id=notification.id,
        type=notification.type,  # type: ignore[arg-type]
        thread_id=notification.thread_id,
        comment_id=notification.comment_id,
        actor=UserOut.model_validate(actor) if actor is not None else None,
        is_read=notification.is_read,
        created_at=notification.created_at,
    )


def unread_count(db: Session, *, user_id: int) -> int:
    """Return the number of unread notifications of ``user_id`` in one query."""
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return int(db.execute(stmt).scalar_one())


def list_notifications(
    db: Session,
    *,
    user_id: int,
    page: int | None = None,
    per_page: int | None = None,
) -> dict[str, object]:
    """Answer the caller's notifications, newest first, in the Page envelope."""
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
    )
    envelope = paginate(db, stmt, page, per_page)
    rows: list[Notification] = envelope["items"]
    actors = _load_actors(db, rows)
    items = [_to_out(row, actors) for row in rows]
    return make_page(items, envelope["page"], envelope["per_page"], envelope["total"])


def mark_read(db: Session, *, user_id: int, notification_id: int) -> None:
    """Mark one of the caller's notifications read; a foreign id answers 404."""
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user_id:
        raise api_error(404, "Notification not found", code="not_found")
    if not notification.is_read:
        notification.is_read = True
        db.commit()


def mark_all_read(db: Session, *, user_id: int) -> int:
    """Mark every unread notification of the caller read and return how many."""
    result = db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return int(result.rowcount or 0)
