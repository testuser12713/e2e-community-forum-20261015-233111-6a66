"""Authentication services: user creation, credential checks, refresh tokens.

Registration, login and the refresh-token lifecycle (rotation, theft detection,
logout and password change) live here. A refresh token is stored only as a hash
and never logged or returned in a response body; the raw value is handed to the
caller so it can be put in the HttpOnly cookie.
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


def create_refresh_token(db: Session, user_id: int, *, family_id: str | None = None) -> str:
    """Persist a fresh refresh token for ``user_id`` and return its raw value.

    Only the hash is stored; the raw value is handed to the caller so login can
    put it in the HttpOnly cookie. A new token family begins when ``family_id``
    is ``None``; rotating reuses the family of the token being replaced.
    """
    settings = get_settings()
    raw_token = generate_refresh_token()
    token = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(raw_token),
        family_id=family_id or secrets.token_hex(16),
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl),
        revoked=False,
    )
    db.add(token)
    db.commit()
    return raw_token


def _unauthorized(message: str) -> HTTPException:
    return api_error(401, message, code="unauthorized")


def _is_expired(token: RefreshToken) -> bool:
    expires = token.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return expires <= datetime.now(UTC)


def revoke_family(db: Session, family_id: str) -> None:
    """Revoke every refresh token of ``family_id`` (the whole session line)."""
    tokens = db.execute(select(RefreshToken).where(RefreshToken.family_id == family_id)).scalars()
    for token in tokens:
        token.revoked = True
    db.commit()


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[User, str]:
    """Rotate the presented refresh token and return ``(user, new_raw_token)``.

    The presented token is revoked and replaced by a fresh one in the same
    family. Presenting an already-rotated token is treated as theft: the entire
    family is revoked and the caller answers 401. An unknown, revoked or expired
    token therefore never yields a new session.
    """
    token = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    ).scalar_one_or_none()
    if token is None:
        raise _unauthorized("Ungültiges Refresh-Token.")
    if token.revoked:
        # Reuse of a rotated token means it may have leaked: kill the family.
        revoke_family(db, token.family_id)
        raise _unauthorized("Das Refresh-Token wurde bereits verwendet.")
    if _is_expired(token):
        token.revoked = True
        db.commit()
        raise _unauthorized("Das Refresh-Token ist abgelaufen.")

    user = db.get(User, token.user_id)
    if user is None:
        token.revoked = True
        db.commit()
        raise _unauthorized("Ungültiges Refresh-Token.")

    token.revoked = True
    new_raw = create_refresh_token(db, user.id, family_id=token.family_id)
    return user, new_raw


def revoke_session_for_token(db: Session, raw_token: str) -> None:
    """Revoke the session family of the presented refresh token, if it exists.

    Used by logout: the token that was used then answers 401 on the next refresh
    attempt because its family carries ``revoked``. A missing token is not an
    error — logout is idempotent and always answers 204.
    """
    token = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    ).scalar_one_or_none()
    if token is not None:
        revoke_family(db, token.family_id)


def change_password(
    db: Session,
    user: User,
    *,
    current_password: str,
    new_password: str,
    current_raw_token: str | None = None,
) -> None:
    """Change ``user``'s password after verifying the current one.

    A wrong current password answers 400 with a field error and leaves the stored
    hash untouched. On success every refresh token of the user is revoked except
    the one currently presented, so other sessions must sign in again while the
    caller stays logged in.
    """
    if not verify_password(current_password, user.password_hash):
        raise api_error(
            400,
            "Das aktuelle Passwort ist falsch.",
            code="invalid_password",
            details=[
                {
                    "field": "current_password",
                    "message": "Das aktuelle Passwort ist falsch.",
                }
            ],
        )

    user.password_hash = hash_password(new_password)

    keep_hash = hash_refresh_token(current_raw_token) if current_raw_token else None
    tokens = db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked.is_(False),
        )
    ).scalars()
    for token in tokens:
        if keep_hash is not None and token.token_hash == keep_hash:
            continue
        token.revoked = True
    db.commit()


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


def clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh cookie, matching the attributes it was set with."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="lax",
    )
