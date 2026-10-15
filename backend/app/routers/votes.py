"""Vote routes for threads and comments."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, rate_limit_write, require_active_writer
from app.models import User
from app.schemas.common import VoteOut
from app.schemas.vote import VoteIn
from app.services.votes import cast_vote

router = APIRouter(tags=["votes"])


@router.post(
    "/api/v1/threads/{id}/vote",
    response_model=VoteOut,
    dependencies=[Depends(rate_limit_write)],
)
def vote_thread(
    id: int,
    payload: VoteIn,
    user: User = Depends(require_active_writer),
    db: Session = Depends(get_db),
) -> VoteOut:
    """Cast, switch or remove the caller's vote on a thread."""
    return cast_vote(db, user=user, content_type="thread", content_id=id, value=payload.value)


@router.post(
    "/api/v1/comments/{id}/vote",
    response_model=VoteOut,
    dependencies=[Depends(rate_limit_write)],
)
def vote_comment(
    id: int,
    payload: VoteIn,
    user: User = Depends(require_active_writer),
    db: Session = Depends(get_db),
) -> VoteOut:
    """Cast, switch or remove the caller's vote on a comment."""
    return cast_vote(db, user=user, content_type="comment", content_id=id, value=payload.value)
