"""Admin category management routes.

Every route is guarded by ``require_admin``: the role check happens on the
server, never in the client. Each successful mutation writes an audit entry in
the same transaction.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, rate_limit_write, require_admin
from app.errors import api_error
from app.models import User
from app.schemas.category import CategoryCreate, CategoryOut, CategoryReorder, CategoryUpdate
from app.schemas.common import Page
from app.services import categories as category_service
from app.services.audit import write_audit

router = APIRouter(tags=["admin-categories"])


@router.put(
    "/api/v1/admin/categories/order",
    response_model=Page[CategoryOut],
    dependencies=[Depends(rate_limit_write)],
)
def reorder_categories(
    payload: CategoryReorder,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    """Rewrite the positions and answer the full ordering."""
    ordered = category_service.reorder_categories(db, payload.ids)
    write_audit(
        db,
        actor_id=admin.id,
        action="category.reorder",
        target_type="category",
        metadata={"ids": payload.ids},
    )
    db.commit()
    return {
        "items": ordered,
        "page": 1,
        "per_page": max(len(ordered), 1),
        "total": len(ordered),
        "pages": 1 if ordered else 0,
    }


@router.post(
    "/api/v1/admin/categories",
    response_model=CategoryOut,
    status_code=201,
    dependencies=[Depends(rate_limit_write)],
)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CategoryOut:
    """Create a category; a name or slug collision answers 409."""
    category = category_service.create_category(
        db,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        position=payload.position,
    )
    write_audit(
        db,
        actor_id=admin.id,
        action="category.create",
        target_type="category",
        target_id=category.id,
        metadata={"name": category.name, "slug": category.slug},
    )
    db.commit()
    db.refresh(category)
    return category


@router.patch(
    "/api/v1/admin/categories/{id}",
    response_model=CategoryOut,
    dependencies=[Depends(rate_limit_write)],
)
def update_category(
    id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> CategoryOut:
    """Update the supplied fields of a category; unknown id answers 404."""
    category = category_service.get_category(db, id)
    if category is None:
        raise api_error(404, "Category not found")
    category_service.update_category(db, category, payload.model_dump(exclude_unset=True))
    write_audit(
        db,
        actor_id=admin.id,
        action="category.update",
        target_type="category",
        target_id=category.id,
        metadata=payload.model_dump(exclude_unset=True),
    )
    db.commit()
    db.refresh(category)
    return category
