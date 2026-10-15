"""Category persistence: listing, lookup and the admin mutations.

The functions here never commit; they stage their changes on the caller's
session so the router can write its audit entry in the same transaction and
commit once. A uniqueness collision raises a 409 in the shared envelope, an
unknown id a 422.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Category
from app.pagination import paginate


def _ordered_select() -> Select[tuple[Category]]:
    return select(Category).order_by(Category.position, Category.id)


def list_categories(db: Session, page: int | None, per_page: int | None) -> dict[str, Any]:
    """Return one page of categories ordered by ``position`` (then id)."""
    return paginate(db, _ordered_select(), page, per_page)


def list_all_categories(db: Session) -> list[Category]:
    """Return every category in its configured order."""
    return list(db.execute(_ordered_select()).scalars().all())


def get_category_by_slug(db: Session, slug: str) -> Category | None:
    """Return the category with ``slug`` or ``None``."""
    return db.execute(select(Category).where(Category.slug == slug)).scalar_one_or_none()


def get_category(db: Session, category_id: int) -> Category | None:
    """Return the category with ``category_id`` or ``None``."""
    return db.get(Category, category_id)


def _assert_unique(
    db: Session,
    *,
    name: str | None,
    slug: str | None,
    exclude_id: int | None = None,
) -> None:
    """Raise 409 when ``name``/``slug`` is already taken by another category."""
    if name is not None:
        stmt = select(Category.id).where(Category.name == name)
        if exclude_id is not None:
            stmt = stmt.where(Category.id != exclude_id)
        if db.execute(stmt).first() is not None:
            raise api_error(
                409,
                "Category name is already taken",
                details=[{"field": "name", "message": "A category with this name already exists."}],
            )
    if slug is not None:
        stmt = select(Category.id).where(Category.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(Category.id != exclude_id)
        if db.execute(stmt).first() is not None:
            raise api_error(
                409,
                "Category slug is already taken",
                details=[{"field": "slug", "message": "A category with this slug already exists."}],
            )


def create_category(
    db: Session,
    *,
    name: str,
    slug: str,
    description: str | None,
    position: int,
) -> Category:
    """Stage a new category, raising 409 on a name/slug collision."""
    _assert_unique(db, name=name, slug=slug)
    category = Category(
        name=name,
        slug=slug,
        description=description,
        position=position,
    )
    db.add(category)
    db.flush()
    return category


def update_category(db: Session, category: Category, fields: dict[str, Any]) -> Category:
    """Apply the supplied fields to ``category``, raising 409 on a collision."""
    name = fields.get("name")
    slug = fields.get("slug")
    if name is not None or slug is not None:
        _assert_unique(db, name=name, slug=slug, exclude_id=category.id)
    for key in ("name", "slug", "description", "position"):
        if key in fields:
            setattr(category, key, fields[key])
    db.flush()
    return category


def reorder_categories(db: Session, ids: list[int]) -> list[Category]:
    """Assign ``position = index`` to each listed id and return the new order.

    Raises 422 when the list repeats an id or names an unknown one; the caller
    is expected to send the full ordering.
    """
    if len(set(ids)) != len(ids):
        raise api_error(
            422,
            "Duplicate category ids",
            code="validation_error",
            details=[{"field": "ids", "message": "Every category id may appear only once."}],
        )
    found = {
        category.id: category
        for category in db.execute(select(Category).where(Category.id.in_(ids))).scalars()
    }
    unknown = [category_id for category_id in ids if category_id not in found]
    if unknown:
        raise api_error(
            422,
            "Unknown category id",
            code="validation_error",
            details=[{"field": "ids", "message": f"Unknown category id(s): {sorted(unknown)}"}],
        )
    for position, category_id in enumerate(ids):
        found[category_id].position = position
    db.flush()
    return list_all_categories(db)
