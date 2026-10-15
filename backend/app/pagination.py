"""The shared page/per_page helper producing the ``Page`` envelope.

Every list endpoint honours ``page`` (>= 1, default 1) and ``per_page``
(default 20, max 100); a page beyond the last answers an empty ``items`` array
and never an error (AC-19).
"""

from __future__ import annotations

from typing import Any, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

DEFAULT_PAGE = 1
DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100

T = TypeVar("T")


def normalize_page(page: int | None, per_page: int | None) -> tuple[int, int]:
    """Clamp ``page`` and ``per_page`` to their contract ranges."""
    safe_page = page if isinstance(page, int) and page >= 1 else DEFAULT_PAGE
    safe_per_page = per_page if isinstance(per_page, int) and per_page >= 1 else DEFAULT_PER_PAGE
    return safe_page, min(safe_per_page, MAX_PER_PAGE)


def page_count(total: int, per_page: int) -> int:
    """Number of pages for ``total`` rows, at least 1 for the envelope."""
    if total <= 0:
        return 0
    return (total + per_page - 1) // per_page


def make_page(items: list[Any], page: int, per_page: int, total: int) -> dict[str, Any]:
    """Build the ``{"items", "page", "per_page", "total", "pages"}`` envelope."""
    return {
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": page_count(total, per_page),
    }


def paginate(
    db: Session,
    stmt: Select[Any],
    page: int | None = None,
    per_page: int | None = None,
    *,
    count_stmt: Select[Any] | None = None,
) -> dict[str, Any]:
    """Execute ``stmt`` for one page and wrap the rows in the Page envelope."""
    safe_page, safe_per_page = normalize_page(page, per_page)

    count_source = count_stmt if count_stmt is not None else stmt
    total = db.execute(
        select(func.count()).select_from(count_source.order_by(None).subquery())
    ).scalar_one()

    offset = (safe_page - 1) * safe_per_page
    rows = list(db.execute(stmt.offset(offset).limit(safe_per_page)).scalars().all())
    return make_page(rows, safe_page, safe_per_page, total)
