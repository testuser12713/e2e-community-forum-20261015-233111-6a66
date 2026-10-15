"""Content report route (AC-24).

``POST /api/v1/reports`` needs an authenticated, non-banned user, is subject to
the write rate limit and answers 404 for unknown content and 409 for a second
open report of the same content by the same user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.deps import get_db, require_active_writer
from app.models import Report, User
from app.schemas.common import ReportOut, UserOut
from app.schemas.report import ReportCreate
from app.services.ratelimit import rate_limit_write
from app.services.reports import create_report

router = APIRouter(tags=["reports"])


def _to_report_out(report: Report, reporter: User) -> ReportOut:
    """Serialise a report row together with its reporter into the contract shape."""
    return ReportOut(
        id=report.id,
        content_type=report.content_type,
        content_id=report.content_id,
        reason=report.reason,
        note=report.note,
        reporter=UserOut.model_validate(reporter),
        status=report.status,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
    )


@router.post(
    "/api/v1/reports",
    status_code=status.HTTP_201_CREATED,
    response_model=ReportOut,
    dependencies=[Depends(rate_limit_write)],
)
def report_content(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_writer),
) -> ReportOut:
    """Create a report and return it in state ``open``."""
    report = create_report(
        db,
        reporter_id=user.id,
        content_type=payload.content_type,
        content_id=payload.content_id,
        reason=payload.reason,
        note=payload.note,
    )
    return _to_report_out(report, user)
