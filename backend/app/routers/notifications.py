"""Notification routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["notifications"])


@router.get("/api/v1/notifications")
def list_notifications() -> None:
    raise not_implemented("GET /api/v1/notifications is implemented by ticket #21")


@router.get("/api/v1/notifications/unread-count")
def unread_count() -> None:
    raise not_implemented("GET /api/v1/notifications/unread-count is implemented by ticket #21")


@router.post(
    "/api/v1/notifications/read-all", status_code=204, dependencies=[Depends(rate_limit_write)]
)
def mark_all_read() -> None:
    raise not_implemented("POST /api/v1/notifications/read-all is implemented by ticket #21")


@router.post(
    "/api/v1/notifications/{id}/read", status_code=204, dependencies=[Depends(rate_limit_write)]
)
def mark_read(id: int) -> None:
    raise not_implemented("POST /api/v1/notifications/{id}/read is implemented by ticket #21")
