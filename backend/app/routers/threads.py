"""Thread write and detail routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["threads"])


@router.post("/api/v1/threads", status_code=201, dependencies=[Depends(rate_limit_write)])
def create_thread() -> None:
    raise not_implemented("POST /api/v1/threads is implemented by ticket #2")


@router.get("/api/v1/threads/{id}")
def get_thread(id: int) -> None:
    raise not_implemented("GET /api/v1/threads/{id} is implemented by ticket #2")


@router.patch("/api/v1/threads/{id}", dependencies=[Depends(rate_limit_write)])
def update_thread(id: int) -> None:
    raise not_implemented("PATCH /api/v1/threads/{id} is implemented by ticket #2")


@router.delete("/api/v1/threads/{id}", status_code=204, dependencies=[Depends(rate_limit_write)])
def delete_thread(id: int) -> None:
    raise not_implemented("DELETE /api/v1/threads/{id} is implemented by ticket #2")


@router.post("/api/v1/threads/{id}/moderate", dependencies=[Depends(rate_limit_write)])
def moderate_thread(id: int) -> None:
    raise not_implemented("POST /api/v1/threads/{id}/moderate is implemented by ticket #37")
