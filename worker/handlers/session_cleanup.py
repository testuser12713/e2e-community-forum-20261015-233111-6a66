"""Handler for the ``session.cleanup`` job.

Deletes every refresh-token row that can no longer be used: tokens whose
``expires_at`` lies in the past and tokens that were revoked. Valid tokens
(unexpired and not revoked) are left untouched, so an active session keeps
working. Both categories are removed with a single bulk ``DELETE`` each — no
row is ever loaded into memory — using the worker's own :class:`RefreshToken`
model.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from models import RefreshToken
from sqlalchemy import delete
from sqlalchemy.orm import Session


def handle(db: Session, payload: dict[str, Any]) -> None:
    """Delete expired or revoked refresh tokens.

    Payload: ``{}``.
    """
    now = datetime.now(UTC)
    db.execute(delete(RefreshToken).where(RefreshToken.expires_at <= now))
    db.execute(delete(RefreshToken).where(RefreshToken.revoked_at.is_not(None)))
