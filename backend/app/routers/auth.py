"""Authentication routes (implemented by the auth tickets)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["auth"])


@router.post("/api/v1/auth/register", status_code=201, dependencies=[Depends(rate_limit_write)])
def register() -> None:
    raise not_implemented("POST /api/v1/auth/register is implemented by ticket #39")


@router.post("/api/v1/auth/login", dependencies=[Depends(rate_limit_write)])
def login() -> None:
    raise not_implemented("POST /api/v1/auth/login is implemented by ticket #39")


@router.post("/api/v1/auth/refresh", dependencies=[Depends(rate_limit_write)])
def refresh() -> None:
    raise not_implemented("POST /api/v1/auth/refresh is implemented by ticket #17")


@router.post("/api/v1/auth/logout", status_code=204, dependencies=[Depends(rate_limit_write)])
def logout() -> None:
    raise not_implemented("POST /api/v1/auth/logout is implemented by ticket #17")


@router.post(
    "/api/v1/auth/change-password", status_code=204, dependencies=[Depends(rate_limit_write)]
)
def change_password() -> None:
    raise not_implemented("POST /api/v1/auth/change-password is implemented by ticket #17")
