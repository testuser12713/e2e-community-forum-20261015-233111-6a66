"""Request bodies for the comment routes.

The response shapes (``CommentNode``, ``CommentSummary``) live in the shared
``app.schemas.common`` module; only the write payloads are declared here.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

MAX_COMMENT_LENGTH = 10000


class CommentCreate(BaseModel):
    """Body of ``POST /api/v1/threads/{id}/comments``."""

    body: str = Field(min_length=1, max_length=MAX_COMMENT_LENGTH)
    parent_id: int | None = None

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class CommentUpdate(BaseModel):
    """Body of ``PATCH /api/v1/comments/{id}``."""

    body: str = Field(min_length=1, max_length=MAX_COMMENT_LENGTH)

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value
