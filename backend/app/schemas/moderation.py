"""Request bodies for the moderation endpoints.

The response shapes themselves (``ThreadDetail``, ``ReportOut``) live in
``app.schemas.common``; this module only declares what a moderator sends to
``POST /api/v1/threads/{id}/moderate`` and
``POST /api/v1/moderation/reports/{id}/resolve``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, model_validator

#: The thread moderation actions the contract declares.
ModerationAction = Literal["pin", "unpin", "lock", "unlock", "move", "remove"]

#: How a moderator closes a report.
ReportResolution = Literal["remove_content", "dismiss"]

#: The report queue status filter.
ReportStatus = Literal["open", "resolved", "dismissed"]


class ModerateThreadRequest(BaseModel):
    """Body of ``POST /api/v1/threads/{id}/moderate``.

    ``category_id`` is required for the ``move`` action and irrelevant for the
    others; a ``move`` without it fails validation with a 422 (AC-37).
    """

    action: ModerationAction
    category_id: int | None = None

    @model_validator(mode="after")
    def _require_category_for_move(self) -> ModerateThreadRequest:
        if self.action == "move" and self.category_id is None:
            raise ValueError("category_id is required when action is 'move'")
        return self


class ResolveReportRequest(BaseModel):
    """Body of ``POST /api/v1/moderation/reports/{id}/resolve``."""

    action: ReportResolution
