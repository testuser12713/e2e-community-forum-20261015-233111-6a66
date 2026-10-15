"""Moderation routes: thread actions, the report queue and resolutions.

All three routes are guarded by ``require_moderator``, enforced on the server,
so a plain user answers 403 (AC-08). ``POST /api/v1/threads/{id}/moderate``
belongs to this module (the skeleton handed it to this ticket); the thread
routes never serve it a second time.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db, require_moderator
from app.models import User
from app.schemas.common import Page, ReportOut, ThreadDetail
from app.schemas.moderation import (
    ModerateThreadRequest,
    ReportStatus,
    ResolveReportRequest,
)
from app.services import moderation as moderation_service
from app.services.ratelimit import rate_limit_write

router = APIRouter(tags=["moderation"])


@router.post("/api/v1/threads/{id}/moderate", response_model=ThreadDetail)
def moderate_thread(
    id: int,
    payload: ModerateThreadRequest,
    moderator: User = Depends(require_moderator),
    db: Session = Depends(get_db),
) -> ThreadDetail:
    """Pin, unlock, move or remove a thread; every action is audited."""
    return moderation_service.moderate_thread(
        db,
        thread_id=id,
        moderator=moderator,
        action=payload.action,
        category_id=payload.category_id,
    )


@router.get("/api/v1/moderation/reports", response_model=Page[ReportOut])
def list_reports(
    status: ReportStatus | None = Query(default=None),
    page: int = Query(default=1),
    per_page: int = Query(default=20),
    moderator: User = Depends(require_moderator),
    db: Session = Depends(get_db),
) -> dict:
    """Return the moderation queue as a Page envelope."""
    return moderation_service.list_reports(
        db,
        status=status,
        page=page,
        per_page=per_page,
    )


@router.post(
    "/api/v1/moderation/reports/{id}/resolve",
    response_model=ReportOut,
    dependencies=[Depends(rate_limit_write)],
)
def resolve_report(
    id: int,
    payload: ResolveReportRequest,
    moderator: User = Depends(require_moderator),
    db: Session = Depends(get_db),
) -> ReportOut:
    """Remove the reported content or dismiss the report; either way it audits."""
    return moderation_service.resolve_report(
        db,
        report_id=id,
        moderator=moderator,
        action=payload.action,
    )
