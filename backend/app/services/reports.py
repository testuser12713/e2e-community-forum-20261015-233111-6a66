"""Content reporting: put a reported thread or comment into the moderation queue.

The route delegates here so the duplicate-open-report rule and the existence
check live in one place. A report is always created in state ``open``; the
moderation queue (ticket #37) later resolves or dismisses it (AC-24).
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Comment, Report, Thread

_CONTENT_MODELS = {"thread": Thread, "comment": Comment}


def create_report(
    db: Session,
    *,
    reporter_id: int,
    content_type: str,
    content_id: int,
    reason: str,
    note: str | None = None,
) -> Report:
    """Create an open report, or raise when the content is missing or already reported.

    Answers 404 when the reported content does not exist and 409 when the same
    user already has an open report on the same content. Commits on success and
    returns the persisted row.
    """
    model = _CONTENT_MODELS[content_type]
    if db.get(model, content_id) is None:
        raise api_error(404, "The reported content does not exist", code="not_found")

    duplicate = db.execute(
        select(Report.id).where(
            Report.reporter_id == reporter_id,
            Report.content_type == content_type,
            Report.content_id == content_id,
            Report.status == "open",
        )
    ).first()
    if duplicate is not None:
        raise api_error(
            409,
            "You have already reported this content",
            code="duplicate_report",
        )

    report = Report(
        content_type=content_type,
        content_id=content_id,
        reason=reason,
        note=note,
        reporter_id=reporter_id,
        status="open",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
