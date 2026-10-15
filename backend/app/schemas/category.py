"""Category request schemas.

The response shape ``CategoryOut`` is the shared contract model defined once in
:mod:`app.schemas.common`; this module only re-exports it and adds the admin
write payloads.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import CategoryOut

__all__ = [
    "CategoryCreate",
    "CategoryOut",
    "CategoryReorder",
    "CategoryUpdate",
]

_SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class CategoryCreate(BaseModel):
    """Body of ``POST /api/v1/admin/categories``."""

    name: str = Field(min_length=1, max_length=80)
    slug: str = Field(min_length=1, max_length=80, pattern=_SLUG_PATTERN)
    description: str | None = None
    position: int = 0


class CategoryUpdate(BaseModel):
    """Body of ``PATCH /api/v1/admin/categories/{id}``.

    Every field is optional; omitted fields keep their stored value and an
    explicit ``null`` description clears it.
    """

    name: str | None = Field(default=None, min_length=1, max_length=80)
    slug: str | None = Field(default=None, min_length=1, max_length=80, pattern=_SLUG_PATTERN)
    description: str | None = None
    position: int | None = None


class CategoryReorder(BaseModel):
    """Body of ``PUT /api/v1/admin/categories/order``."""

    ids: list[int] = Field(min_length=1)
