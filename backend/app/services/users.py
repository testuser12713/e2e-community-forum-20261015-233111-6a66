"""Profile reads and writes, and the two public profile list queries.

Each list query joins everything it renders — the author, the category and the
thread title — in a single statement and pages with the shared helper of
``app.pagination``, so a profile page issues no N+1 query and a page beyond the
last answers an empty ``items`` array (AC-19).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Category, Comment, Thread, User
from app.pagination import make_page, normalize_page

__all__ = [
    "get_public_profile",
    "list_user_comments",
    "list_user_threads",
    "update_current_user",
]

_Builder = Callable[[Any], dict[str, Any]]


def get_public_profile(db: Session, username: str) -> User:
    """Return the user behind ``username`` or raise the shared 404 envelope."""
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if user is None:
        raise api_error(404, f"No user named '{username}'", code="not_found")
    return user


def update_current_user(db: Session, user: User, changes: dict[str, Any]) -> User:
    """Apply the sent profile fields to ``user`` and persist them."""
    for field, value in changes.items():
        setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _paginate(
    db: Session,
    stmt: Select[Any],
    page: int | None,
    per_page: int | None,
    build: _Builder,
) -> dict[str, Any]:
    """Execute ``stmt`` for one page and wrap the rows in the Page envelope."""
    safe_page, safe_per_page = normalize_page(page, per_page)
    total = db.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()
    offset = (safe_page - 1) * safe_per_page
    rows = db.execute(stmt.offset(offset).limit(safe_per_page)).all()
    return make_page([build(row) for row in rows], safe_page, safe_per_page, total)


def _thread_summary(thread: Thread, category: Category, author: User) -> dict[str, Any]:
    return {
        "id": thread.id,
        "title": thread.title,
        "category": category,
        "author": author,
        "tags": list(thread.tags or []),
        "score": thread.score,
        "comment_count": thread.comment_count,
        "is_pinned": thread.is_pinned,
        "is_locked": thread.is_locked,
        "is_deleted": thread.is_deleted,
        "created_at": thread.created_at,
        "last_activity_at": thread.last_activity_at,
    }


def _comment_summary(comment: Comment, thread_title: str) -> dict[str, Any]:
    return {
        "id": comment.id,
        "thread_id": comment.thread_id,
        "thread_title": thread_title,
        "body_markdown": comment.body_markdown,
        "score": comment.score,
        "is_deleted": comment.is_deleted,
        "created_at": comment.created_at,
    }


def list_user_threads(
    db: Session,
    user: User,
    page: int | None = None,
    per_page: int | None = None,
) -> dict[str, Any]:
    """Page the threads authored by ``user``, newest first."""
    stmt = (
        select(Thread, Category)
        .join(Category, Category.id == Thread.category_id)
        .where(Thread.author_id == user.id, Thread.is_removed.is_(False))
        .order_by(Thread.created_at.desc(), Thread.id.desc())
    )
    return _paginate(db, stmt, page, per_page, lambda row: _thread_summary(row[0], row[1], user))


def list_user_comments(
    db: Session,
    user: User,
    page: int | None = None,
    per_page: int | None = None,
) -> dict[str, Any]:
    """Page the comments authored by ``user``, newest first."""
    stmt = (
        select(Comment, Thread.title)
        .join(Thread, Thread.id == Comment.thread_id)
        .where(Comment.author_id == user.id, Comment.is_removed.is_(False))
        .order_by(Comment.created_at.desc(), Comment.id.desc())
    )
    return _paginate(db, stmt, page, per_page, lambda row: _comment_summary(row[0], row[1]))
