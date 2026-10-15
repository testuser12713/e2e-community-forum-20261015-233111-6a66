"""``report`` table — content reports entering the moderation queue."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Report(Base):
    __tablename__ = "report"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content_type: Mapped[str] = mapped_column(String(16), nullable=False)
    content_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="open", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
