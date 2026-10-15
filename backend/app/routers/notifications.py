"""Notification routes.

Serves the authenticated user's own notifications: the paginated list, the
unread count, marking one read and marking all read. Every failure answers the
shared error envelope.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import User
from app.schemas.common import NotificationOut, Page
from app.schemas.notification import UnreadCountOut
from app.services import notifications as notifications_service
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["notifications"])


@router.get("/api/v1/notifications", response_model=Page[NotificationOut])
def list_notifications(
    page: int = 1,
    per_page: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Return the caller's notifications, newest first, in the Page envelope."""
    return notifications_service.list_notifications(
        db, user_id=user.id, page=page, per_page=per_page
    )


@router.get("/api/v1/notifications/unread-count", response_model=UnreadCountOut)
def unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UnreadCountOut:
    """Return how many of the caller's notifications are unread."""
    return UnreadCountOut(unread=notifications_service.unread_count(db, user_id=user.id))


@router.post(
    "/api/v1/notifications/read-all", status_code=204, dependencies=[Depends(rate_limit_write)]
)
def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Mark every unread notification of the caller read."""
    notifications_service.mark_all_read(db, user_id=user.id)
    return Response(status_code=204)


@router.post(
    "/api/v1/notifications/{id}/read", status_code=204, dependencies=[Depends(rate_limit_write)]
)
def mark_read(
    id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Mark one of the caller's notifications read; a foreign id answers 404."""
    notifications_service.mark_read(db, user_id=user.id, notification_id=id)
    return Response(status_code=204)
