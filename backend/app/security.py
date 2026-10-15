"""Password hashing (Argon2id), JWT access tokens and refresh-token hashing."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2 import Type as Argon2Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.config import get_settings

_hasher = PasswordHasher(type=Argon2Type.ID)
_JWT_ALGORITHM = "HS256"


class TokenError(Exception):
    """Raised when an access token is missing, malformed or expired."""


def hash_password(password: str) -> str:
    """Return an Argon2id hash of ``password``."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Return True when ``password`` matches the stored Argon2id hash."""
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(
    user_id: int,
    role: str,
    *,
    expires_in: int | None = None,
) -> str:
    """Encode a signed access token with the contract lifetime (15 minutes)."""
    settings = get_settings()
    now = datetime.now(UTC)
    ttl = expires_in if expires_in is not None else settings.access_token_ttl
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token, raising ``TokenError`` on failure."""
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[_JWT_ALGORITHM],
        )
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired access token") from exc
    if payload.get("type") != "access":
        raise TokenError("Invalid or expired access token")
    return payload


def generate_refresh_token() -> str:
    """Return a fresh opaque refresh token."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """Return the deterministic hash stored for a refresh token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
