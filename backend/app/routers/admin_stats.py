"""Admin dashboard statistics route."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_implemented

router = APIRouter(tags=["admin-stats"])


@router.get("/api/v1/admin/stats")
def admin_stats() -> None:
    raise not_implemented("GET /api/v1/admin/stats is implemented by ticket #35")
