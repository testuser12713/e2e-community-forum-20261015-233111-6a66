"""Aggregate queries behind the admin dashboard statistics (AC-29).

Every figure is computed by PostgreSQL in a single SELECT built from scalar
sub-queries: no row of ``user``, ``thread``, ``comment`` or ``report`` is ever
loaded into Python just to be counted.

"Live" means not soft-deleted (``deleted_at IS NULL``), matching the rest of the
product: a soft-deleted thread or comment keeps its row but is no longer counted
as content. Users are counted regardless of ban state — a banned account still
exists.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Comment, Report, Thread, User
from app.schemas.common import AdminStats

WINDOW_DAYS = 7


def compute_admin_stats(db: Session, *, now: datetime | None = None) -> AdminStats:
    """Return every dashboard figure in one aggregate query.

    ``now`` is injectable so a test can pin the rolling windows; production
    always passes the current UTC time.
    """
    reference = now or datetime.now(UTC)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=UTC)
    seven_days_ago = reference - timedelta(days=WINDOW_DAYS)
    start_of_today = reference.replace(hour=0, minute=0, second=0, microsecond=0)

    live_comment = Comment.deleted_at.is_(None)

    statement = select(
        select(func.count()).select_from(User).scalar_subquery().label("total_users"),
        select(func.count())
        .select_from(User)
        .where(User.created_at >= seven_days_ago)
        .scalar_subquery()
        .label("new_users_7d"),
        select(func.count())
        .select_from(Thread)
        .where(Thread.deleted_at.is_(None))
        .scalar_subquery()
        .label("total_threads"),
        select(func.count())
        .select_from(Comment)
        .where(live_comment)
        .scalar_subquery()
        .label("total_comments"),
        select(func.count())
        .select_from(Comment)
        .where(live_comment, Comment.created_at >= start_of_today)
        .scalar_subquery()
        .label("comments_today"),
        select(func.count())
        .select_from(Comment)
        .where(live_comment, Comment.created_at >= seven_days_ago)
        .scalar_subquery()
        .label("comments_7d"),
        select(func.count())
        .select_from(Report)
        .where(Report.status == "open")
        .scalar_subquery()
        .label("open_reports"),
    )

    row = db.execute(statement).one()
    return AdminStats(
        total_users=row.total_users,
        new_users_7d=row.new_users_7d,
        total_threads=row.total_threads,
        total_comments=row.total_comments,
        comments_today=row.comments_today,
        comments_7d=row.comments_7d,
        open_reports=row.open_reports,
    )
