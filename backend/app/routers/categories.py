"""Public category read routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.errors import api_error
from app.schemas.category import CategoryOut
from app.schemas.common import Page
from app.services import categories as category_service

router = APIRouter(tags=["categories"])


@router.get("/api/v1/categories", response_model=Page[CategoryOut])
def list_categories(
    page: int = Query(1),
    per_page: int = Query(20),
    db: Session = Depends(get_db),
) -> dict:
    """Return the categories ordered by position."""
    return category_service.list_categories(db, page, per_page)


@router.get("/api/v1/categories/{slug}", response_model=CategoryOut)
def get_category(slug: str, db: Session = Depends(get_db)) -> CategoryOut:
    """Return a single category by its slug."""
    category = category_service.get_category_by_slug(db, slug)
    if category is None:
        raise api_error(404, "Category not found")
    return category
