"""Thread subscription routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["subscriptions"])


@router.get("/api/v1/threads/{id}/subscription")
def get_subscription(id: int) -> None:
    raise not_implemented("GET /api/v1/threads/{id}/subscription is implemented by ticket #18")


@router.post(
    "/api/v1/threads/{id}/subscription",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def subscribe(id: int) -> None:
    raise not_implemented("POST /api/v1/threads/{id}/subscription is implemented by ticket #18")


@router.delete(
    "/api/v1/threads/{id}/subscription",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def unsubscribe(id: int) -> None:
    raise not_implemented("DELETE /api/v1/threads/{id}/subscription is implemented by ticket #18")
