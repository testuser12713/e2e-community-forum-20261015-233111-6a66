"""``vote`` table — at most one vote per user per thread and per comment."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Vote(Base):
    __tablename__ = "vote"
    __table_args__ = (
        UniqueConstraint("user_id", "thread_id", name="uq_vote_user_thread"),
        UniqueConstraint("user_id", "comment_id", name="uq_vote_user_comment"),
        CheckConstraint(
            "(thread_id IS NOT NULL AND comment_id IS NULL) "
            "OR (thread_id IS NULL AND comment_id IS NOT NULL)",
            name="ck_vote_one_target",
        ),
        CheckConstraint("value IN (1, -1)", name="ck_vote_value"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    thread_id: Mapped[int | None] = mapped_column(
        ForeignKey("thread.id", ondelete="CASCADE"), nullable=True, index=True
    )
    comment_id: Mapped[int | None] = mapped_column(
        ForeignKey("comment.id", ondelete="CASCADE"), nullable=True, index=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
