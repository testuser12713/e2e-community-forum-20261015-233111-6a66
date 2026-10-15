"""Admin user management routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["admin-users"])


@router.get("/api/v1/admin/users")
def list_users() -> None:
    raise not_implemented("GET /api/v1/admin/users is implemented by ticket #38")


@router.patch("/api/v1/admin/users/{id}/role", dependencies=[Depends(rate_limit_write)])
def set_role(id: int) -> None:
    raise not_implemented("PATCH /api/v1/admin/users/{id}/role is implemented by ticket #38")


@router.post("/api/v1/admin/users/{id}/ban", dependencies=[Depends(rate_limit_write)])
def ban_user(id: int) -> None:
    raise not_implemented("POST /api/v1/admin/users/{id}/ban is implemented by ticket #38")


@router.delete("/api/v1/admin/users/{id}/ban", dependencies=[Depends(rate_limit_write)])
def unban_user(id: int) -> None:
    raise not_implemented("DELETE /api/v1/admin/users/{id}/ban is implemented by ticket #38")
