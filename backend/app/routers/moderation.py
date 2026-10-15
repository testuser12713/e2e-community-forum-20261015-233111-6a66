"""Moderation queue routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["moderation"])


@router.get("/api/v1/moderation/reports")
def list_reports() -> None:
    raise not_implemented("GET /api/v1/moderation/reports is implemented by ticket #37")


@router.post("/api/v1/moderation/reports/{id}/resolve", dependencies=[Depends(rate_limit_write)])
def resolve_report(id: int) -> None:
    raise not_implemented(
        "POST /api/v1/moderation/reports/{id}/resolve is implemented by ticket #37"
    )
