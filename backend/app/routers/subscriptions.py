"""Thread subscription routes.

``GET`` / ``POST`` / ``DELETE /api/v1/threads/{id}/subscription``. All three need
an authenticated user; subscribing and unsubscribing are idempotent and answer
``204``. An unknown thread answers ``404`` in the shared error envelope.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.errors import api_error
from app.models import User
from app.schemas.subscription import SubscriptionState
from app.services import subscriptions as subscriptions_service
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["subscriptions"])


def _require_thread(db: Session, thread_id: int) -> None:
    if not subscriptions_service.thread_exists(db, thread_id):
        raise api_error(404, "Thread not found", code="not_found")


@router.get("/api/v1/threads/{id}/subscription", response_model=SubscriptionState)
def get_subscription(
    id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubscriptionState:
    """Return whether the caller is subscribed to the thread."""
    _require_thread(db, id)
    subscribed = subscriptions_service.is_subscribed(db, user_id=user.id, thread_id=id)
    return SubscriptionState(subscribed=subscribed)


@router.post(
    "/api/v1/threads/{id}/subscription",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def subscribe(
    id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Subscribe the caller to the thread (idempotent)."""
    _require_thread(db, id)
    subscriptions_service.subscribe(db, user_id=user.id, thread_id=id)


@router.delete(
    "/api/v1/threads/{id}/subscription",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def unsubscribe(
    id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Unsubscribe the caller from the thread (idempotent)."""
    _require_thread(db, id)
    subscriptions_service.unsubscribe(db, user_id=user.id, thread_id=id)
