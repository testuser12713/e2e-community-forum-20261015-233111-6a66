"""Admin dashboard statistics route (AC-29).

``GET /api/v1/admin/stats`` is restricted to administrators by
:func:`app.deps.require_admin`; a signed-in plain user (or moderator) receives
403 in the shared error envelope (AC-08).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import User
from app.schemas.admin_stats import AdminStats
from app.services.admin_stats import compute_admin_stats

router = APIRouter(tags=["admin-stats"])


@router.get("/api/v1/admin/stats", response_model=AdminStats)
def admin_stats(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminStats:
    """Return the aggregate figures of the admin dashboard."""
    return compute_admin_stats(db)
