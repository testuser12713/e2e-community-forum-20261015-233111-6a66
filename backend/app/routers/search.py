"""Full-text search route: ``GET /api/v1/search``.

Public endpoint. ``q`` is required; a missing one answers 422 in the shared
error envelope. ``category`` (slug) and ``tag`` narrow the hits, and the page
envelope is the shared one (AC-19, AC-20, AC-37).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import Page, ThreadSummary
from app.services.search import search_threads

router = APIRouter(tags=["search"])


@router.get("/api/v1/search", response_model=Page[ThreadSummary])
def search(
    q: str = Query(..., min_length=1),
    category: str | None = Query(None),
    tag: str | None = Query(None),
    page: int | None = Query(None),
    per_page: int | None = Query(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return the threads whose title or body match ``q``, ranked by relevance."""
    return search_threads(
        db,
        q=q,
        category=category,
        tag=tag,
        page=page,
        per_page=per_page,
    )
