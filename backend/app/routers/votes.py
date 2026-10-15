"""Vote routes for threads and comments."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["votes"])


@router.post("/api/v1/threads/{id}/vote", dependencies=[Depends(rate_limit_write)])
def vote_thread(id: int) -> None:
    raise not_implemented("POST /api/v1/threads/{id}/vote is implemented by ticket #19")


@router.post("/api/v1/comments/{id}/vote", dependencies=[Depends(rate_limit_write)])
def vote_comment(id: int) -> None:
    raise not_implemented("POST /api/v1/comments/{id}/vote is implemented by ticket #19")
