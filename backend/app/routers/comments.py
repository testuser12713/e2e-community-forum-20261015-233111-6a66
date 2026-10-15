"""Nested comment read, write and delete routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_active_writer
from app.models import User
from app.schemas.comment import CommentCreate, CommentUpdate
from app.schemas.common import CommentNode, Page
from app.security import TokenError, decode_access_token
from app.services import comments
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["comments"])

_bearer = HTTPBearer(auto_error=False)


def optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Resolve the caller when a valid Bearer token is present, else ``None``.

    Reading a comment tree is public, so a missing or stale token never blocks
    the request; it only means ``my_vote`` is 0.
    """
    if credentials is None or not credentials.credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (TokenError, KeyError, TypeError, ValueError):
        return None
    return db.get(User, user_id)


@router.get("/api/v1/threads/{id}/comments", response_model=Page[CommentNode])
def list_comments(
    id: int,
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    viewer: User | None = Depends(optional_current_user),
) -> dict:
    return comments.list_comments(db, id, viewer=viewer, page=page, per_page=per_page)


@router.post(
    "/api/v1/threads/{id}/comments",
    status_code=201,
    response_model=CommentNode,
    dependencies=[Depends(rate_limit_write)],
)
def create_comment(
    id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_writer),
) -> CommentNode:
    return comments.create_comment(
        db, id, author=user, body=payload.body, parent_id=payload.parent_id
    )


@router.patch(
    "/api/v1/comments/{id}",
    response_model=CommentNode,
    dependencies=[Depends(rate_limit_write)],
)
def update_comment(
    id: int,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_writer),
) -> CommentNode:
    return comments.update_comment(db, id, user=user, body=payload.body)


@router.delete(
    "/api/v1/comments/{id}",
    status_code=204,
    dependencies=[Depends(rate_limit_write)],
)
def delete_comment(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_writer),
) -> None:
    comments.delete_comment(db, id, user=user)
