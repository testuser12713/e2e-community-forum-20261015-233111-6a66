"""Request bodies for the thread write routes.

The response shapes are the shared contract models in
``app/schemas/common.py`` (``ThreadSummary`` / ``ThreadDetail``); this module
only carries the write payloads the client sends.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ThreadCreate(BaseModel):
    """Body of ``POST /api/v1/threads``."""

    category_id: int
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class ThreadUpdate(BaseModel):
    """Body of ``PATCH /api/v1/threads/{id}`` — every field optional."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, min_length=1)
    tags: list[str] | None = None
