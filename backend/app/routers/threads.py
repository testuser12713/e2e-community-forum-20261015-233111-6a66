"""Thread detail and write routes.

The public detail route resolves an optional Bearer token so ``my_vote`` and
``subscribed`` are filled for a signed-in reader; the write routes require an
authenticated, non-banned user and are guarded by the shared write rate limit.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.deps import get_db, require_active_writer
from app.errors import not_implemented
from app.models import User
from app.schemas.common import ThreadDetail
from app.schemas.thread import ThreadCreate, ThreadUpdate
from app.security import TokenError, decode_access_token
from app.services import threads as thread_service
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["threads"])

_optional_bearer = HTTPBearer(auto_error=False)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Return the Bearer user when a valid token is present, else ``None``."""
    if credentials is None or not credentials.credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (TokenError, KeyError, TypeError, ValueError):
        return None
    return db.get(User, user_id)


@router.post("/api/v1/threads", status_code=201, dependencies=[Depends(rate_limit_write)])
def create_thread(
    payload: ThreadCreate,
    user: User = Depends(require_active_writer),
    db: Session = Depends(get_db),
) -> ThreadDetail:
    """Create a thread and return its detail."""
    return thread_service.create_thread(
        db,
        author=user,
        category_id=payload.category_id,
        title=payload.title,
        body=payload.body,
        tags=payload.tags,
    )


@router.get("/api/v1/threads/{id}", response_model=ThreadDetail)
def get_thread(
    id: int,
    viewer: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
) -> ThreadDetail:
    """Return a thread's detail; readable without authentication."""
    return thread_service.get_thread(db, id, current_user_id=viewer.id if viewer else None)


@router.patch("/api/v1/threads/{id}", dependencies=[Depends(rate_limit_write)])
def update_thread(
    id: int,
    payload: ThreadUpdate,
    user: User = Depends(require_active_writer),
    db: Session = Depends(get_db),
) -> ThreadDetail:
    """Edit one's own thread and mark it as edited."""
    return thread_service.update_thread(
        db,
        thread_id=id,
        user=user,
        title=payload.title,
        body=payload.body,
        tags=payload.tags,
    )


@router.delete("/api/v1/threads/{id}", status_code=204, dependencies=[Depends(rate_limit_write)])
def delete_thread(
    id: int,
    user: User = Depends(require_active_writer),
    db: Session = Depends(get_db),
) -> None:
    """Soft-delete one's own thread."""
    thread_service.delete_thread(db, thread_id=id, user=user)


@router.post("/api/v1/threads/{id}/moderate", dependencies=[Depends(rate_limit_write)])
def moderate_thread(id: int) -> None:
    raise not_implemented("POST /api/v1/threads/{id}/moderate is implemented by ticket #37")
