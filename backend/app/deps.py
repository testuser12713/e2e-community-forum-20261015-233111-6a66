"""Shared FastAPI dependencies used by every router.

``get_db``, ``get_current_user``, ``require_moderator``, ``require_admin``,
``require_active_writer`` and ``rate_limit_write`` are the names the whole
sprint imports from here.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import api_error
from app.models import User
from app.security import TokenError, decode_access_token
from app.services.ratelimit import rate_limit_write

__all__ = [
    "get_current_user",
    "get_db",
    "rate_limit_write",
    "require_active_writer",
    "require_admin",
    "require_moderator",
]

_bearer = HTTPBearer(auto_error=False)


def _is_currently_banned(user: User) -> bool:
    if not user.is_banned:
        return False
    if user.ban_expires_at is None:
        return True
    expires = user.ban_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return expires > datetime.now(UTC)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the Bearer access token."""
    if credentials is None or not credentials.credentials:
        raise api_error(401, "Not authenticated", code="unauthorized")
    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise api_error(401, str(exc), code="unauthorized") from exc
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise api_error(401, "Invalid access token", code="unauthorized") from exc
    user = db.get(User, user_id)
    if user is None:
        raise api_error(401, "Not authenticated", code="unauthorized")
    return user


def require_moderator(user: User = Depends(get_current_user)) -> User:
    """Allow moderators and administrators only."""
    if user.role not in ("moderator", "admin"):
        raise api_error(403, "Moderator privileges required")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Allow administrators only."""
    if user.role != "admin":
        raise api_error(403, "Administrator privileges required")
    return user


def require_active_writer(user: User = Depends(get_current_user)) -> User:
    """Allow an authenticated, non-banned user to write."""
    if _is_currently_banned(user):
        details = {
            "reason": user.ban_reason,
            "expires_at": user.ban_expires_at.isoformat() if user.ban_expires_at else None,
        }
        raise api_error(403, f"Gesperrt: {user.ban_reason}", code="user_banned", details=details)
    return user
