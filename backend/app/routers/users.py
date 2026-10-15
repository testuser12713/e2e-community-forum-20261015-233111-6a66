"""User profile routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["users"])


@router.get("/api/v1/users/me")
def read_me() -> None:
    raise not_implemented("GET /api/v1/users/me is implemented by ticket #17")


@router.patch("/api/v1/users/me", dependencies=[Depends(rate_limit_write)])
def update_me() -> None:
    raise not_implemented("PATCH /api/v1/users/me is implemented by ticket #22")


@router.get("/api/v1/users/{username}/threads")
def user_threads(username: str) -> None:
    raise not_implemented("GET /api/v1/users/{username}/threads is implemented by ticket #22")


@router.get("/api/v1/users/{username}/comments")
def user_comments(username: str) -> None:
    raise not_implemented("GET /api/v1/users/{username}/comments is implemented by ticket #22")


@router.get("/api/v1/users/{username}")
def user_profile(username: str) -> None:
    raise not_implemented("GET /api/v1/users/{username} is implemented by ticket #22")
