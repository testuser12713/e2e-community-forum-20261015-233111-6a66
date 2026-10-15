"""Handler for the ``notification.create`` job.

Turns a queued job into a ``notification`` row for its target user. The row is
inserted inside the claim transaction; the engine marks the job ``done`` once
the handler returns. The handler is idempotent per event: a second run for the
same ``(user_id, type, actor_id, thread_id, comment_id)`` leaves the existing
row alone instead of inserting a duplicate. A missing target user is skipped —
the job is completed rather than retried forever against a row that cannot be
written.
"""

from __future__ import annotations

from typing import Any

from models import Notification, User
from sqlalchemy import select
from sqlalchemy.orm import Session

#: The notification types declared by the shared contract's job payload.
NOTIFICATION_TYPES = ("reply", "mention", "thread_comment")


def _as_optional_int(value: Any) -> int | None:
    """Coerce a payload field to ``int`` (or ``None`` when absent)."""
    if value is None:
        return None
    return int(value)


def _column_equals(column: Any, value: int | None) -> Any:
    """Build a comparison that also matches SQL ``NULL`` for an absent value."""
    return column.is_(None) if value is None else column == value


def handle(db: Session, payload: dict[str, Any]) -> None:
    """Turn a queued notification job into a notification row.

    Payload: ``{"user_id": int, "type": "reply"|"mention"|"thread_comment",
    "actor_id": int, "thread_id": int, "comment_id": int|None}``.
    """
    user_id = payload.get("user_id")
    if user_id is None:
        raise ValueError("notification.create payload is missing 'user_id'")

    user_id = int(user_id)

    # A deleted target user cannot receive a notification: complete the job
    # instead of retrying it forever against the user foreign key.
    if db.get(User, user_id) is None:
        return

    notification_type = payload.get("type")
    if notification_type not in NOTIFICATION_TYPES:
        raise ValueError(
            f"notification.create payload has an invalid 'type': {notification_type!r}"
        )

    actor_id = _as_optional_int(payload.get("actor_id"))
    thread_id = _as_optional_int(payload.get("thread_id"))
    comment_id = _as_optional_int(payload.get("comment_id"))

    # Idempotency: the same event must not produce a second notification row.
    existing = db.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.type == notification_type,
            _column_equals(Notification.actor_id, actor_id),
            _column_equals(Notification.thread_id, thread_id),
            _column_equals(Notification.comment_id, comment_id),
        )
    )
    if existing is not None:
        return

    db.add(
        Notification(
            user_id=user_id,
            type=notification_type,
            actor_id=actor_id,
            thread_id=thread_id,
            comment_id=comment_id,
            is_read=False,
        )
    )
    db.flush()
