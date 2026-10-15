"""Handler for the ``notification.create`` job.

The signature is complete so the notification handler ticket depends only on
this skeleton; the body implements no product logic yet.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def handle(db: Session, payload: dict[str, Any]) -> None:
    """Turn a queued notification job into a notification row.

    Payload: ``{"user_id": int, "type": "reply"|"mention"|"thread_comment",
    "actor_id": int, "thread_id": int, "comment_id": int|None}``.
    """
