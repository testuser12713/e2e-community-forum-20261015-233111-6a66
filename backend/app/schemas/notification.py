"""Notification response schemas.

``NotificationOut`` is the shared shape every ticket imports from
``app.schemas.common``; it is re-exported here together with the small schemas
this feature adds. The list endpoint answers the shared ``Page`` envelope.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import NotificationOut, Page

__all__ = ["NotificationOut", "Page", "UnreadCountOut"]


class UnreadCountOut(BaseModel):
    """Response of ``GET /api/v1/notifications/unread-count``."""

    unread: int
