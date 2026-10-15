"""Query schema for the admin audit-log list endpoint.

The response shape itself lives in ``app.schemas.common.AuditLogOut``; this
module only declares the filters and pagination of
``GET /api/v1/admin/audit-logs`` so the router and the OpenAPI document agree
with the contract.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import Query
from pydantic import BaseModel, Field

from app.pagination import DEFAULT_PER_PAGE, MAX_PER_PAGE

AuditTargetType = Literal["thread", "comment", "user", "category", "report"]


class AuditLogQuery(BaseModel):
    """The declared filters of ``GET /api/v1/admin/audit-logs``."""

    actor_id: int | None = Field(default=None, ge=1)
    action: str | None = Field(default=None, min_length=1, max_length=64)
    target_type: AuditTargetType | None = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=DEFAULT_PER_PAGE, ge=1, le=MAX_PER_PAGE)


AuditLogQueryParams = Annotated[AuditLogQuery, Query()]
