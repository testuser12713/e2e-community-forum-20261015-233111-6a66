"""Full-text search route."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_implemented

router = APIRouter(tags=["search"])


@router.get("/api/v1/search")
def search() -> None:
    raise not_implemented("GET /api/v1/search is implemented by ticket #23")
