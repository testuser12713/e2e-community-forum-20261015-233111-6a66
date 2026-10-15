"""Request bodies for the admin user-management endpoints.

The response shape is the shared :class:`app.schemas.common.AdminUserOut`; only
the write payloads are defined here.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import Role


class RoleUpdate(BaseModel):
    """Body of ``PATCH /api/v1/admin/users/{id}/role``."""

    role: Role


class BanCreate(BaseModel):
    """Body of ``POST /api/v1/admin/users/{id}/ban``.

    ``expires_at`` is optional: without it the ban is indefinite.
    """

    reason: str = Field(min_length=1, max_length=500)
    expires_at: datetime | None = None
