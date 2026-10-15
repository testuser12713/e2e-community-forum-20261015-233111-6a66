"""Admin user management: search, role changes, bans and their audit entries.

Each mutating function writes its audit entry and commits the user row together
in one transaction, so a change and its audit trail can never diverge. Role and
ban state live on the ``user`` row only; the request dependencies re-read that
row on every request, which is why a role change takes effect on the very next
request without a new login.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import User
from app.pagination import paginate
from app.services.audit import write_audit

TARGET_TYPE = "user"
ACTION_ROLE_CHANGE = "user.role_change"
ACTION_BAN = "user.ban"
ACTION_UNBAN = "user.unban"


def _like_pattern(term: str) -> str:
    """Wrap ``term`` in a ``%…%`` pattern, escaping LIKE wildcards."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_users(
    db: Session,
    *,
    q: str | None = None,
    page: int | None = None,
    per_page: int | None = None,
) -> dict[str, Any]:
    """Return one page of users, filtered by username and e-mail (AC-30)."""
    stmt = select(User)
    term = (q or "").strip()
    if term:
        pattern = _like_pattern(term)
        stmt = stmt.where(
            or_(
                User.username.ilike(pattern, escape="\\"),
                User.email.ilike(pattern, escape="\\"),
            )
        )
    stmt = stmt.order_by(User.id.asc())
    return paginate(db, stmt, page, per_page)


def _get_target(db: Session, target_id: int) -> User:
    target = db.get(User, target_id)
    if target is None:
        raise api_error(404, "User not found")
    return target


def set_role(db: Session, *, actor: User, target_id: int, role: str) -> User:
    """Change ``target_id``'s role; an administrator cannot change their own."""
    if actor.id == target_id:
        raise api_error(400, "You cannot change your own role")
    target = _get_target(db, target_id)
    previous = target.role
    target.role = role
    write_audit(
        db,
        actor_id=actor.id,
        action=ACTION_ROLE_CHANGE,
        target_type=TARGET_TYPE,
        target_id=target.id,
        metadata={"from": previous, "to": role},
    )
    db.commit()
    db.refresh(target)
    return target


def ban_user(
    db: Session,
    *,
    actor: User,
    target_id: int,
    reason: str,
    expires_at: datetime | None,
) -> User:
    """Ban ``target_id`` with a reason and an optional expiry; never oneself."""
    if actor.id == target_id:
        raise api_error(400, "You cannot ban yourself")
    target = _get_target(db, target_id)
    target.is_banned = True
    target.ban_reason = reason
    target.ban_expires_at = expires_at
    write_audit(
        db,
        actor_id=actor.id,
        action=ACTION_BAN,
        target_type=TARGET_TYPE,
        target_id=target.id,
        metadata={
            "reason": reason,
            "expires_at": expires_at.isoformat() if expires_at else None,
        },
    )
    db.commit()
    db.refresh(target)
    return target


def unban_user(db: Session, *, actor: User, target_id: int) -> User:
    """Lift ``target_id``'s ban and clear its reason and expiry."""
    target = _get_target(db, target_id)
    target.is_banned = False
    target.ban_reason = None
    target.ban_expires_at = None
    write_audit(
        db,
        actor_id=actor.id,
        action=ACTION_UNBAN,
        target_type=TARGET_TYPE,
        target_id=target.id,
        metadata={},
    )
    db.commit()
    db.refresh(target)
    return target
