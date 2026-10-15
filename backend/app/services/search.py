"""PostgreSQL full-text search over threads.

``GET /api/v1/search`` finds a word that may occur only in a thread body,
honours the category and tag filters and orders the hits by relevance
(``ts_rank``). Author and category are loaded in the same joined query, so a
result page never issues a query per row (AC-19, AC-20).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.orm import Session

from app.models import Category, Thread, User
from app.pagination import make_page, normalize_page
from app.schemas import CategoryOut, ThreadSummary, UserOut

# The text-search configuration used for both the vector and the query.
TS_CONFIG = "english"


def search_vector() -> ColumnElement[Any]:
    """The ``tsvector`` over a thread's title and body.

    The skeleton's migration indexes this exact expression with a GIN index, so
    the predicate stays index-friendly.
    """
    return func.to_tsvector(TS_CONFIG, Thread.title + " " + Thread.body_markdown)


def _plain_query(q: str) -> ColumnElement[Any]:
    """Turn free text into a safe ``tsquery`` (no syntax errors from input)."""
    return func.plainto_tsquery(TS_CONFIG, q)


def _filtered_statement(
    query: ColumnElement[Any],
    category: str | None,
    tag: str | None,
) -> tuple[Select[Any], ColumnElement[Any]]:
    """Build the joined, filtered statement and its ``ts_rank`` column."""
    vector = search_vector()
    rank = func.ts_rank(vector, query).label("rank")

    stmt: Select[Any] = (
        select(Thread, Category, User, rank)
        .join(Category, Thread.category_id == Category.id)
        .join(User, Thread.author_id == User.id)
        .where(vector.op("@@")(query))
        .where(Thread.is_deleted.is_(False))
        .where(Thread.is_removed.is_(False))
    )
    if category:
        stmt = stmt.where(Category.slug == category)
    if tag:
        stmt = stmt.where(Thread.tags.contains([tag]))
    return stmt, rank


def _to_summary(thread: Thread, category: Category, author: User) -> ThreadSummary:
    """Build the shared ``ThreadSummary`` from the joined rows."""
    return ThreadSummary(
        id=thread.id,
        title=thread.title,
        category=CategoryOut.model_validate(category),
        author=UserOut.model_validate(author),
        tags=list(thread.tags or []),
        score=thread.score,
        comment_count=thread.comment_count,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        is_deleted=thread.is_deleted,
        created_at=thread.created_at,
        last_activity_at=thread.last_activity_at,
    )


def search_threads(
    db: Session,
    *,
    q: str,
    category: str | None = None,
    tag: str | None = None,
    page: int | None = None,
    per_page: int | None = None,
) -> dict[str, Any]:
    """Search threads by full text and return the shared Page envelope.

    Hits are ordered by relevance, with the most recently active thread first as
    the tie-breaker; a page past the last answers an empty ``items`` list.
    """
    safe_page, safe_per_page = normalize_page(page, per_page)
    query = _plain_query(q)
    stmt, rank = _filtered_statement(query, category, tag)

    total = db.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()

    offset = (safe_page - 1) * safe_per_page
    rows = db.execute(
        stmt.order_by(rank.desc(), Thread.last_activity_at.desc())
        .offset(offset)
        .limit(safe_per_page)
    ).all()

    items = [_to_summary(thread, cat, author) for thread, cat, author, _rank in rows]
    return make_page(items, safe_page, safe_per_page, total)
