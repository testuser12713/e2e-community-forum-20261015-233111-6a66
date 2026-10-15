"""The thread feed route (sort=new|top|hot)."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_implemented

router = APIRouter(tags=["feed"])


@router.get("/api/v1/threads")
def list_threads() -> None:
    raise not_implemented("GET /api/v1/threads is implemented by ticket #1")
