"""Request schemas for the user profile routes.

The response shapes of the contract live in ``app.schemas.common`` and are
imported from there, never redefined here.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UserUpdate(BaseModel):
    """Body of ``PATCH /api/v1/users/me`` — every field is optional.

    A field that is absent is left untouched; a field explicitly sent as
    ``null`` clears it. ``bio`` is capped at 500 characters, which is enforced
    here so an over-long value answers 422 in the shared error envelope.
    """

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=512)


__all__ = ["UserUpdate"]
