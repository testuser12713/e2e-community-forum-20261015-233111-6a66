"""Request schema for ``POST /api/v1/reports`` (AC-24).

The response shape is the shared :class:`app.schemas.common.ReportOut`; this
module only declares the request body.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

ReportContentType = Literal["thread", "comment"]

REASON_MAX_LENGTH = 64
NOTE_MAX_LENGTH = 500


class ReportCreate(BaseModel):
    """Body of ``POST /api/v1/reports``."""

    content_type: ReportContentType
    content_id: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=REASON_MAX_LENGTH)
    note: str | None = Field(default=None, max_length=NOTE_MAX_LENGTH)

    @field_validator("reason")
    @classmethod
    def _reason_not_blank(cls, value: str) -> str:
        """Reject a reason made only of whitespace."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("reason must not be blank")
        return stripped

    @field_validator("note")
    @classmethod
    def _blank_note_is_none(cls, value: str | None) -> str | None:
        """Normalise a blank note to ``None``."""
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None
