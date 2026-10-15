"""Complete database schema for the community forum.

One module per table. The schema is created exclusively through
``alembic upgrade head`` (see ``alembic/versions/0001_initial.py``).
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base shared by every model."""


from app.models.audit import AuditLog  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.comment import Comment  # noqa: E402
from app.models.job import Job  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.report import Report  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.models.thread import Thread  # noqa: E402
from app.models.token import RefreshToken  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.vote import Vote  # noqa: E402

__all__ = [
    "AuditLog",
    "Base",
    "Category",
    "Comment",
    "Job",
    "Notification",
    "RefreshToken",
    "Report",
    "Subscription",
    "Thread",
    "User",
    "Vote",
]
