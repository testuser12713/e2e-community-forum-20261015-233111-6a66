"""The thread feed route: ``GET /api/v1/threads``.

Sorts by ``new`` (creation time), ``top`` (score) or ``hot`` (the worker
maintained hot score), filters by category slug and tag, and answers the shared
``Page`` envelope. Authors and categories are joined in a single query and the
tags and comment count ride on the thread row, so no list item triggers an
extra query (AC-18, AC-19).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Category, Thread, User
from app.pagination import make_page, normalize_page
from app.schemas.common import Page, ThreadSummary
from app.services import ranking

router = APIRouter(tags=["feed"])

SortKey = Literal["new", "top", "hot"]


def _feed_stmt(
    sort: str,
    category: str | None,
    tag: str | None,
) -> Select:
    """Build the filtered thread feed query with author and category joined."""
    stmt = (
        select(Thread, Category, User)
        .join(Category, Thread.category_id == Category.id)
        .join(User, Thread.author_id == User.id)
        .where(
            Thread.is_deleted.is_(False),
            Thread.is_removed.is_(False),
        )
    )
    if category is not None:
        stmt = stmt.where(Category.slug == category)
    if tag is not None:
        stmt = stmt.where(Thread.tags.contains([tag]))
    return stmt.order_by(*ranking.order_by(sort))


def _summary(thread: Thread, category: Category, author: User) -> dict[str, Any]:
    """Shape one feed row into the shared ``ThreadSummary`` fields."""
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


@router.get("/api/v1/threads", response_model=Page[ThreadSummary])
def list_threads(
    sort: SortKey = "new",
    category: Annotated[str | None, Query()] = None,
    tag: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query()] = 1,
    per_page: Annotated[int, Query()] = 20,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """List live threads, filtered and sorted, in the shared Page envelope."""
    safe_page, safe_per_page = normalize_page(page, per_page)
    stmt = _feed_stmt(sort, category, tag)

    total = db.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()

    offset = (safe_page - 1) * safe_per_page
    rows = db.execute(stmt.offset(offset).limit(safe_per_page)).all()
    items = [_summary(thread, cat, author) for thread, cat, author in rows]
    return make_page(items, safe_page, safe_per_page, total)
