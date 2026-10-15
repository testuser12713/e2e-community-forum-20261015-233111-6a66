"""Authentication routes.

Registration and login are implemented here; refresh rotation, logout and
password change belong to the follow-up ticket and keep their stubs (they answer
501 until that ticket fills them).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import api_error, not_implemented
from app.schemas.auth import LoginInput, RegisterInput
from app.schemas.common import AuthOut, UserMe, UserOut
from app.security import create_access_token
from app.services.auth import (
    authenticate_user,
    create_refresh_token,
    create_user,
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


@router.post("/api/v1/auth/refresh", dependencies=[Depends(rate_limit_write)])
def refresh() -> None:
    raise not_implemented("POST /api/v1/auth/refresh is implemented by ticket #17")


@router.post("/api/v1/auth/logout", status_code=204, dependencies=[Depends(rate_limit_write)])
def logout() -> None:
    raise not_implemented("POST /api/v1/auth/logout is implemented by ticket #17")


@router.post(
    "/api/v1/auth/change-password", status_code=204, dependencies=[Depends(rate_limit_write)]
)
def change_password() -> None:
    raise not_implemented("POST /api/v1/auth/change-password is implemented by ticket #17")
