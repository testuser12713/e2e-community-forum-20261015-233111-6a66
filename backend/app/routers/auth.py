"""Authentication routes.

Registration, login and the refresh-token lifecycle live here: refresh rotation
with theft detection, logout and password change. Every failure is raised
through the shared error envelope and refresh tokens are only ever stored as
hashes.
"""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.errors import api_error
from app.models import User
from app.schemas.auth import ChangePasswordInput, LoginInput, RegisterInput
from app.schemas.common import AuthOut, UserMe, UserOut
from app.security import create_access_token
from app.services.auth import (
    REFRESH_COOKIE_NAME,
    authenticate_user,
    change_password,
    clear_refresh_cookie,
    create_refresh_token,
    create_user,
    revoke_session_for_token,
    rotate_refresh_token,
    set_refresh_cookie,
)
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["auth"])


@router.post(
    "/api/v1/auth/register",
    status_code=201,
    response_model=UserOut,
    dependencies=[Depends(rate_limit_write)],
)
def register(payload: RegisterInput, db: Session = Depends(get_db)) -> UserOut:
    """Create an account; duplicate username/e-mail answer 409, weak password 422."""
    user = create_user(
        db,
        username=payload.username,
        email=payload.email,
        password=payload.password,
    )
    return UserOut.model_validate(user)


@router.post(
    "/api/v1/auth/login",
    response_model=AuthOut,
    dependencies=[Depends(rate_limit_write)],
)
def login(
    payload: LoginInput,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthOut:
    """Sign in by username or e-mail; sets the refresh cookie and returns a token."""
    user = authenticate_user(
        db,
        identifier=payload.username_or_email,
        password=payload.password,
    )
    if user is None:
        raise api_error(
            401,
            "Benutzername oder Passwort ist falsch.",
            code="unauthorized",
        )
    raw_refresh = create_refresh_token(db, user.id)
    set_refresh_cookie(response, raw_refresh)
    access_token = create_access_token(user.id, user.role)
    return AuthOut(
        access_token=access_token,
        token_type="bearer",
        expires_in=900,
        user=UserMe.model_validate(user),
    )


@router.post(
    "/api/v1/auth/refresh",
    response_model=AuthOut,
    dependencies=[Depends(rate_limit_write)],
)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> AuthOut:
    """Rotate the refresh cookie and answer a fresh access token.

    A missing, unknown, expired or already-rotated token answers 401; replaying a
    rotated token additionally revokes every token of its session family.
    """
    if not refresh_token:
        raise api_error(401, "Kein Refresh-Token vorhanden.", code="unauthorized")
    user, raw_refresh = rotate_refresh_token(db, refresh_token)
    set_refresh_cookie(response, raw_refresh)
    access_token = create_access_token(user.id, user.role)
    return AuthOut(
        access_token=access_token,
        token_type="bearer",
        expires_in=900,
        user=UserMe.model_validate(user),
    )


@router.post(
    "/api/v1/auth/logout",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def logout(
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> None:
    """Revoke the presented session and clear the refresh cookie."""
    if refresh_token:
        revoke_session_for_token(db, refresh_token)
    clear_refresh_cookie(response)


@router.post(
    "/api/v1/auth/change-password",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def change_password_route(
    payload: ChangePasswordInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> None:
    """Change the signed-in user's password, keeping this session alive."""
    change_password(
        db,
        user,
        current_password=payload.current_password,
        new_password=payload.new_password,
        current_raw_token=refresh_token,
    )
