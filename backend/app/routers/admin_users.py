"""Admin user management routes.

All four endpoints are guarded by ``require_admin``: the role is read from the
``user`` row on every request, so a role change is effective on the target's
next request without a new login (AC-09). The ban is stored on the user row and
enforced for writes by ``require_active_writer`` on the content routes (AC-10).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import User
from app.schemas.admin_users import BanCreate, RoleUpdate
from app.schemas.common import AdminUserOut, Page
from app.services import admin_users as service
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["admin-users"])


@router.get("/api/v1/admin/users", response_model=Page[AdminUserOut])
def list_users(
    q: str | None = None,
    page: int = 1,
    per_page: int = 20,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Search users by username and e-mail and page the result."""
    return service.list_users(db, q=q, page=page, per_page=per_page)


@router.patch(
    "/api/v1/admin/users/{id}/role",
    response_model=AdminUserOut,
    dependencies=[Depends(rate_limit_write)],
)
def set_role(
    id: int,
    payload: RoleUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Change a user's role; a self change answers 400."""
    return service.set_role(db, actor=admin, target_id=id, role=payload.role)


@router.post(
    "/api/v1/admin/users/{id}/ban",
    response_model=AdminUserOut,
    dependencies=[Depends(rate_limit_write)],
)
def ban_user(
    id: int,
    payload: BanCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Ban a user with a reason and an optional expiry; self ban answers 400."""
    return service.ban_user(
        db,
        actor=admin,
        target_id=id,
        reason=payload.reason,
        expires_at=payload.expires_at,
    )


@router.delete(
    "/api/v1/admin/users/{id}/ban",
    response_model=AdminUserOut,
    dependencies=[Depends(rate_limit_write)],
)
def unban_user(
    id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> User:
    """Lift a user's ban."""
    return service.unban_user(db, actor=admin, target_id=id)
