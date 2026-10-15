"""``subscription`` table — one row per user per subscribed thread."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Subscription(Base):
    __tablename__ = "subscription"
    __table_args__ = (UniqueConstraint("user_id", "thread_id", name="uq_subscription_user_thread"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("thread.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
