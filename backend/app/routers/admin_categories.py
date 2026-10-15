"""Admin category management routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["admin-categories"])


@router.put("/api/v1/admin/categories/order", dependencies=[Depends(rate_limit_write)])
def reorder_categories() -> None:
    raise not_implemented("PUT /api/v1/admin/categories/order is implemented by ticket #28")


@router.post("/api/v1/admin/categories", status_code=201, dependencies=[Depends(rate_limit_write)])
def create_category() -> None:
    raise not_implemented("POST /api/v1/admin/categories is implemented by ticket #28")


@router.patch("/api/v1/admin/categories/{id}", dependencies=[Depends(rate_limit_write)])
def update_category(id: int) -> None:
    raise not_implemented("PATCH /api/v1/admin/categories/{id} is implemented by ticket #28")
