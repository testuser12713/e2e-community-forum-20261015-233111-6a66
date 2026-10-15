"""Handler for the ``session.cleanup`` job.

The signature is complete so the session-cleanup handler ticket depends only on
this skeleton; the body implements no product logic yet.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def handle(db: Session, payload: dict[str, Any]) -> None:
    """Delete expired or revoked refresh tokens.

    Payload: ``{}``.
    """
