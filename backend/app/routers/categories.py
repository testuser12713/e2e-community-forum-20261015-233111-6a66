"""Category read routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_implemented

router = APIRouter(tags=["categories"])


@router.get("/api/v1/categories")
def list_categories() -> None:
    raise not_implemented("GET /api/v1/categories is implemented by ticket #28")


@router.get("/api/v1/categories/{slug}")
def get_category(slug: str) -> None:
    raise not_implemented("GET /api/v1/categories/{slug} is implemented by ticket #28")
