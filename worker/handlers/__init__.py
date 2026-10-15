"""The handler registry.

Maps every job kind of the shared contract to its handler function. The
handler tickets fill the three implementations in
:mod:`handlers.notifications`, :mod:`handlers.hot_score` and
:mod:`handlers.session_cleanup`; the signature they implement is
``handle(db: Session, payload: dict[str, Any]) -> None``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

from handlers import hot_score, notifications, session_cleanup

#: A job handler receives the session of the claim transaction and the job's
#: parsed JSON payload. It runs inside a savepoint: raising rolls the job's work
#: back and triggers the engine's retry/backoff path.
Handler = Callable[[Session, dict[str, Any]], None]

HANDLERS: dict[str, Handler] = {
    "notification.create": notifications.handle,
    "thread.hot_score": hot_score.handle,
    "session.cleanup": session_cleanup.handle,
}


def get_handler(kind: str) -> Handler | None:
    """Return the handler registered for ``kind``, or ``None`` if there is none."""
    return HANDLERS.get(kind)
