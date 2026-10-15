"""Nested comment read, write and delete routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["comments"])


@router.get("/api/v1/threads/{id}/comments")
def list_comments(id: int) -> None:
    raise not_implemented("GET /api/v1/threads/{id}/comments is implemented by ticket #3")


@router.post(
    "/api/v1/threads/{id}/comments",
    status_code=201,
    dependencies=[Depends(rate_limit_write)],
)
def create_comment(id: int) -> None:
    raise not_implemented("POST /api/v1/threads/{id}/comments is implemented by ticket #3")


@router.patch("/api/v1/comments/{id}", dependencies=[Depends(rate_limit_write)])
def update_comment(id: int) -> None:
    raise not_implemented("PATCH /api/v1/comments/{id} is implemented by ticket #3")


@router.delete("/api/v1/comments/{id}", status_code=204, dependencies=[Depends(rate_limit_write)])
def delete_comment(id: int) -> None:
    raise not_implemented("DELETE /api/v1/comments/{id} is implemented by ticket #3")
