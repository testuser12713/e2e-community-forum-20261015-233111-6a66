"""Writing audit-log entries for moderation and admin actions."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    target_type: str,
    target_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Insert an audit entry in the caller's transaction and return it."""
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        meta=metadata or {},
    )
    db.add(entry)
    db.flush()
    return entry
