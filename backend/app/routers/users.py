"""User profile routes: the signed-in user's own profile and public profiles."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db, rate_limit_write
from app.models import User
from app.schemas.common import CommentSummary, Page, ThreadSummary, UserMe, UserProfileOut
from app.schemas.user import UserUpdate
from app.services import users as users_service

router = APIRouter(tags=["users"])


@router.get("/api/v1/users/me", response_model=UserMe)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user's own profile."""
    return current_user


@router.patch(
    "/api/v1/users/me",
    response_model=UserMe,
    dependencies=[Depends(rate_limit_write)],
)
def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Persist the sent display name, bio and avatar URL."""
    return users_service.update_current_user(
        db, current_user, payload.model_dump(exclude_unset=True)
    )


@router.get("/api/v1/users/{username}/threads", response_model=Page[ThreadSummary])
def user_threads(
    username: str,
    page: int | None = None,
    per_page: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Page the public threads of ``username``."""
    user = users_service.get_public_profile(db, username)
    return users_service.list_user_threads(db, user, page, per_page)


@router.get("/api/v1/users/{username}/comments", response_model=Page[CommentSummary])
def user_comments(
    username: str,
    page: int | None = None,
    per_page: int | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Page the public comments of ``username``."""
    user = users_service.get_public_profile(db, username)
    return users_service.list_user_comments(db, user, page, per_page)


@router.get("/api/v1/users/{username}", response_model=UserProfileOut)
def user_profile(username: str, db: Session = Depends(get_db)) -> User:
    """Return the public profile of ``username`` or 404."""
    return users_service.get_public_profile(db, username)
