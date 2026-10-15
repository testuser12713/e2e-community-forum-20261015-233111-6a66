"""Content report route."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["reports"])


@router.post("/api/v1/reports", status_code=201, dependencies=[Depends(rate_limit_write)])
def create_report() -> None:
    raise not_implemented("POST /api/v1/reports is implemented by ticket #29")
