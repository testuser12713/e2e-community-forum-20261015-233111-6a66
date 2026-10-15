"""Admin audit-log route."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_implemented

router = APIRouter(tags=["admin-audit"])


@router.get("/api/v1/admin/audit-logs")
def list_audit_logs() -> None:
    raise not_implemented("GET /api/v1/admin/audit-logs is implemented by ticket #40")
