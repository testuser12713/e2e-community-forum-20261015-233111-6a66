"""Voting on threads and comments: score and karma bookkeeping.

One vote per user and content. Casting the same value again removes the vote,
the opposite value switches it. The content score and the author's karma are
updated by the same delta and returned in the same response (AC-16, AC-17).
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Comment, Thread, User, Vote
from app.schemas.common import VoteOut

ContentType = Literal["thread", "comment"]


def _resolve_target(
    db: Session, content_type: ContentType, content_id: int
) -> tuple[Thread | Comment | None, int | None]:
    """Return the voted content and its author id, or ``(None, None)``."""
    if content_type == "thread":
        thread = db.get(Thread, content_id)
        return thread, (thread.author_id if thread is not None else None)
    comment = db.get(Comment, content_id)
    return comment, (comment.author_id if comment is not None else None)


def _existing_vote(
    db: Session, user_id: int, content_type: ContentType, content_id: int
) -> Vote | None:
    """Return the caller's current vote on the content, if any."""
    stmt = select(Vote).where(Vote.user_id == user_id)
    if content_type == "thread":
        stmt = stmt.where(Vote.thread_id == content_id)
    else:
        stmt = stmt.where(Vote.comment_id == content_id)
    return db.scalars(stmt).one_or_none()


def cast_vote(
    db: Session,
    *,
    user: User,
    content_type: ContentType,
    content_id: int,
    value: int,
) -> VoteOut:
    """Cast, switch or remove ``user``'s vote and return the fresh totals."""
    content, author_id = _resolve_target(db, content_type, content_id)
    if content is None:
        raise api_error(404, f"{content_type.capitalize()} not found", code="not_found")

    if author_id is not None and author_id == user.id:
        raise api_error(400, "You cannot vote on your own content", code="own_content")

    existing = _existing_vote(db, user.id, content_type, content_id)
    if existing is None:
        if content_type == "thread":
            db.add(Vote(user_id=user.id, thread_id=content_id, value=value))
        else:
            db.add(Vote(user_id=user.id, comment_id=content_id, value=value))
        delta = value
        my_vote = value
    elif existing.value == value:
        db.delete(existing)
        delta = -value
        my_vote = 0
    else:
        delta = value - existing.value
        existing.value = value
        my_vote = value

    content.score = (content.score or 0) + delta
    author = db.get(User, author_id) if author_id is not None else None
    if author is not None:
        author.karma = (author.karma or 0) + delta

    score = content.score
    karma = author.karma if author is not None else 0
    db.commit()
    return VoteOut(score=score, karma=karma, my_vote=my_vote)
