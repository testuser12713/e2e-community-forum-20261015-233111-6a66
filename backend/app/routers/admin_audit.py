"""Admin audit-log route.

``GET /api/v1/admin/audit-logs`` returns every recorded moderation and admin
action (AC-28), newest first, in the shared ``Page`` envelope and filterable by
actor, action and target type. Administrators only (AC-08).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.deps import get_db, require_admin
from app.models import AuditLog, User
from app.pagination import make_page, normalize_page
from app.schemas.audit import AuditLogQueryParams
from app.schemas.common import AuditLogOut, Page, UserOut

router = APIRouter(tags=["admin-audit"])


@router.get("/api/v1/admin/audit-logs", response_model=Page[AuditLogOut])
def list_audit_logs(
    params: AuditLogQueryParams,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """List audit entries newest first, filtered and wrapped in the Page envelope."""
    page, per_page = normalize_page(params.page, params.per_page)

    conditions: list[ColumnElement[bool]] = []
    if params.actor_id is not None:
        conditions.append(AuditLog.actor_id == params.actor_id)
    if params.action is not None:
        conditions.append(AuditLog.action == params.action)
    if params.target_type is not None:
        conditions.append(AuditLog.target_type == params.target_type)

    total = db.execute(select(func.count(AuditLog.id)).where(*conditions)).scalar_one()

    # A single outer join loads the actor with the entry, so no N+1 query.
    rows = db.execute(
        select(AuditLog, User)
        .outerjoin(User, AuditLog.actor_id == User.id)
        .where(*conditions)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()

    items = [
        AuditLogOut(
            id=entry.id,
            actor=UserOut.model_validate(actor) if actor is not None else None,
            action=entry.action,
            target_type=entry.target_type,
            target_id=entry.target_id,
            metadata=entry.meta or {},
            created_at=entry.created_at,
        )
        for entry, actor in rows
    ]
    return make_page(items, page, per_page, total)
