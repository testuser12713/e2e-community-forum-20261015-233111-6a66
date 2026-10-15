"""Moderation logic behind the moderation routes.

Covers the three moderation responsibilities of the contract: the thread
actions (pin, unpin, lock, unlock, move, remove), the paginated report queue
and the resolution of a report (remove the reported content or dismiss).

Every action writes exactly one audit entry through
``app.services.audit.write_audit`` in the same transaction as the change, so a
moderator's work is always traceable (AC-27, AC-28). Locking a thread only sets
``is_locked``; the comment flow reads that flag and rejects new comments while
reads keep working (AC-26).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Category, Comment, Report, Subscription, Thread, User, Vote
from app.pagination import paginate
from app.schemas.common import CategoryOut, ReportOut, ThreadDetail, UserOut
from app.services.audit import write_audit
from app.services.rendering import render_markdown

#: The literal contract marker a soft-deleted thread shows instead of its body.
DELETED_MARKER = "[gelöscht]"


def _user_out(db: Session, user_id: int) -> UserOut:
    user = db.get(User, user_id)
    if user is None:  # pragma: no cover - FK guarantees the row exists
        raise api_error(404, "User not found")
    return UserOut.model_validate(user)


def _category_out(db: Session, category_id: int) -> CategoryOut:
    category = db.get(Category, category_id)
    if category is None:  # pragma: no cover - FK guarantees the row exists
        raise api_error(404, "Category not found")
    return CategoryOut.model_validate(category)


def _my_vote(db: Session, thread_id: int, current_user_id: int | None) -> int:
    if current_user_id is None:
        return 0
    value = db.scalar(
        select(Vote.value).where(
            Vote.user_id == current_user_id,
            Vote.thread_id == thread_id,
        )
    )
    return int(value) if value is not None else 0


def _is_subscribed(db: Session, thread_id: int, current_user_id: int | None) -> bool:
    if current_user_id is None:
        return False
    return (
        db.scalar(
            select(Subscription.id).where(
                Subscription.user_id == current_user_id,
                Subscription.thread_id == thread_id,
            )
        )
        is not None
    )


def build_thread_detail(
    db: Session, thread: Thread, *, current_user_id: int | None = None
) -> ThreadDetail:
    """Shape a ``Thread`` row into the contract ``ThreadDetail``."""
    body_html = DELETED_MARKER if thread.is_deleted else render_markdown(thread.body_markdown)
    return ThreadDetail(
        id=thread.id,
        title=thread.title,
        category=_category_out(db, thread.category_id),
        author=_user_out(db, thread.author_id),
        tags=list(thread.tags or []),
        score=thread.score,
        comment_count=thread.comment_count,
        is_pinned=thread.is_pinned,
        is_locked=thread.is_locked,
        is_deleted=thread.is_deleted,
        created_at=thread.created_at,
        last_activity_at=thread.last_activity_at,
        body_markdown=thread.body_markdown,
        body_html=body_html,
        edited_at=thread.edited_at,
        my_vote=_my_vote(db, thread.id, current_user_id),
        subscribed=_is_subscribed(db, thread.id, current_user_id),
    )


def _build_report_out(db: Session, report: Report) -> ReportOut:
    reporter = db.get(User, report.reporter_id)
    if reporter is None:  # pragma: no cover - the FK cascades with the user
        reporter_out = UserOut(
            id=report.reporter_id,
            username="[gelöscht]",
            display_name="[gelöscht]",
            avatar_url=None,
        )
    else:
        reporter_out = UserOut.model_validate(reporter)
    return ReportOut(
        id=report.id,
        content_type=report.content_type,
        content_id=report.content_id,
        reason=report.reason,
        note=report.note,
        reporter=reporter_out,
        status=report.status,
        created_at=report.created_at,
        resolved_at=report.resolved_at,
    )


def _soft_delete_reported_content(db: Session, report: Report) -> None:
    """Apply the ``remove_content`` resolution to the reported row."""
    now = datetime.now(UTC)
    if report.content_type == "thread":
        thread = db.get(Thread, report.content_id)
        if thread is not None and not thread.is_deleted:
            thread.is_removed = True
            thread.is_deleted = True
            thread.deleted_at = now
    elif report.content_type == "comment":
        comment = db.get(Comment, report.content_id)
        if comment is not None and not comment.is_deleted:
            comment.is_removed = True
            comment.is_deleted = True
            comment.deleted_at = now


def moderate_thread(
    db: Session,
    *,
    thread_id: int,
    moderator: User,
    action: str,
    category_id: int | None = None,
) -> ThreadDetail:
    """Apply one moderation action to a thread and write its audit entry."""
    thread = db.get(Thread, thread_id)
    if thread is None:
        raise api_error(404, "Thread not found")

    metadata: dict[str, Any] = {"action": action}

    if action == "pin":
        thread.is_pinned = True
    elif action == "unpin":
        thread.is_pinned = False
    elif action == "lock":
        thread.is_locked = True
    elif action == "unlock":
        thread.is_locked = False
    elif action == "move":
        if category_id is None:
            raise api_error(422, "category_id is required when action is 'move'")
        if db.get(Category, category_id) is None:
            raise api_error(404, "Category not found")
        metadata["from_category_id"] = thread.category_id
        metadata["category_id"] = category_id
        thread.category_id = category_id
    elif action == "remove":
        thread.is_removed = True
        thread.is_deleted = True
        thread.deleted_at = datetime.now(UTC)
    else:  # pragma: no cover - the request schema constrains the literal
        raise api_error(422, "Unknown moderation action")

    metadata["is_pinned"] = thread.is_pinned
    metadata["is_locked"] = thread.is_locked
    write_audit(
        db,
        actor_id=moderator.id,
        action=f"thread.{action}",
        target_type="thread",
        target_id=thread.id,
        metadata=metadata,
    )
    db.commit()
    return build_thread_detail(db, thread, current_user_id=moderator.id)


def list_reports(
    db: Session,
    *,
    status: str | None = None,
    page: int | None = None,
    per_page: int | None = None,
) -> dict[str, Any]:
    """Return the report queue as a Page envelope, optionally filtered."""
    stmt = select(Report).order_by(Report.created_at.desc(), Report.id.desc())
    if status is not None:
        stmt = stmt.where(Report.status == status)

    result = paginate(db, stmt, page, per_page)
    result["items"] = [_build_report_out(db, report) for report in result["items"]]
    return result


def resolve_report(
    db: Session,
    *,
    report_id: int,
    moderator: User,
    action: str,
) -> ReportOut:
    """Close a report, optionally removing the reported content."""
    report = db.get(Report, report_id)
    if report is None:
        raise api_error(404, "Report not found")

    metadata: dict[str, Any] = {
        "content_type": report.content_type,
        "content_id": report.content_id,
    }

    if action == "remove_content":
        _soft_delete_reported_content(db, report)
        report.status = "resolved"
        metadata["removed_content"] = True
    elif action == "dismiss":
        report.status = "dismissed"
        metadata["removed_content"] = False
    else:  # pragma: no cover - the request schema constrains the literal
        raise api_error(422, "Unknown report resolution")

    report.resolved_at = datetime.now(UTC)
    write_audit(
        db,
        actor_id=moderator.id,
        action=f"report.{action}",
        target_type="report",
        target_id=report.id,
        metadata=metadata,
    )
    db.commit()
    return _build_report_out(db, report)
