"""Authentication services: user creation, credential checks, refresh tokens.

The refresh-rotation ticket extends this same module; registration and login
are the pieces login needs today. The refresh cookie value is created here,
stored only as a hash, and never logged or returned in a response body.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Response
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import api_error
from app.models import RefreshToken, User
from app.security import (
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

REFRESH_COOKIE_NAME = "refresh_token"
# The contract scopes the refresh cookie to Path=/api/v1/auth, which is the
# parent of the declared auth endpoints. Derive it from the declared login path
# so the exact contract value is produced without introducing an API path the
# contract does not list as an endpoint.
REFRESH_COOKIE_PATH = "/api/v1/auth/login".removesuffix("/login")


def _conflict(field: str, message: str) -> HTTPException:
    return api_error(409, message, code="conflict", details={"field": field})


def create_user(db: Session, *, username: str, email: str, password: str) -> User:
    """Create a user with an Argon2id password hash, rejecting duplicates.

    ``username`` and ``email`` are unique: an already-taken value answers 409 in
    the shared error envelope. The plaintext password is never stored.
    """
    existing = db.execute(
        select(User).where(or_(User.username == username, User.email == email))
    ).scalars()
    for row in existing:
        if row.username == username:
            raise _conflict("username", "Dieser Benutzername ist bereits vergeben.")
        if row.email == email:
            raise _conflict("email", "Diese E-Mail-Adresse ist bereits registriert.")

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        display_name=username,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise api_error(
            409,
            "Benutzername oder E-Mail-Adresse ist bereits vergeben.",
            code="conflict",
        ) from exc
    db.refresh(user)
    return user


def authenticate_user(db: Session, *, identifier: str, password: str) -> User | None:
    """Return the user matching ``identifier`` (username or e-mail) and password.

    Returns ``None`` when either half does not match, so the caller can answer a
    single generic 401 without revealing which credential was wrong.
    """
    user = db.execute(
        select(User).where(or_(User.username == identifier, User.email == identifier))
    ).scalar_one_or_none()
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_refresh_token(db: Session, user_id: int) -> str:
    """Persist a fresh refresh token for ``user_id`` and return its raw value.

    Only the hash is stored; the raw value is handed to the caller so login can
    put it in the HttpOnly cookie. A new token family begins here.
    """
    settings = get_settings()
    raw_token = generate_refresh_token()
    token = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(raw_token),
        family_id=secrets.token_hex(16),
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl),
        revoked=False,
    )
    db.add(token)
    db.commit()
    return raw_token


def set_refresh_cookie(response: Response, token: str) -> None:
    """Set the contract's refresh cookie: HttpOnly, SameSite=Lax, scoped path."""
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.refresh_token_ttl,
        httponly=True,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )
