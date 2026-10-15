"""Every response shape of the shared API contract.

The names, field names and field types here are the single source of truth the
whole sprint builds against; feature tickets import them instead of inventing
their own.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

Role = Literal["user", "moderator", "admin"]
VoteValue = Literal[1, -1, 0]


class ErrorDetail(BaseModel):
    """The inner object of the shared error envelope."""

    code: str
    message: str
    details: Any = None


class ErrorEnvelope(BaseModel):
    """``{"error": {"code", "message", "details"}}`` — every failure body."""

    error: ErrorDetail


class Page[T](BaseModel):
    """The collection envelope shared by every list endpoint."""

    items: list[T]
    page: int
    per_page: int
    total: int
    pages: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_url: str | None = None


class UserMe(UserOut):
    email: str
    role: Role
    bio: str | None = None
    karma: int
    is_banned: bool
    ban_reason: str | None = None
    ban_expires_at: datetime | None = None


class UserProfileOut(UserOut):
    bio: str | None = None
    karma: int
    created_at: datetime


class AuthOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = 900
    user: UserMe


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None = None
    position: int


class ThreadSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category: CategoryOut
    author: UserOut
    tags: list[str]
    score: int
    comment_count: int
    is_pinned: bool
    is_locked: bool
    is_deleted: bool
    created_at: datetime
    last_activity_at: datetime


class ThreadDetail(ThreadSummary):
    body_markdown: str
    body_html: str
    edited_at: datetime | None = None
    my_vote: VoteValue = 0
    subscribed: bool = False


class CommentNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    parent_id: int | None = None
    depth: int
    author: UserOut | None = None
    body_markdown: str
    body_html: str
    score: int
    my_vote: VoteValue = 0
    is_deleted: bool
    created_at: datetime
    edited_at: datetime | None = None
    replies: list[CommentNode] = []


class CommentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    thread_id: int
    thread_title: str
    body_markdown: str
    score: int
    is_deleted: bool
    created_at: datetime


class VoteOut(BaseModel):
    score: int
    karma: int
    my_vote: VoteValue


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content_type: Literal["thread", "comment"]
    content_id: int
    reason: str
    note: str | None = None
    reporter: UserOut
    status: Literal["open", "resolved", "dismissed"]
    created_at: datetime
    resolved_at: datetime | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: Literal["reply", "mention", "thread_comment"]
    thread_id: int
    comment_id: int | None = None
    actor: UserOut | None = None
    is_read: bool
    created_at: datetime


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    display_name: str
    role: Role
    karma: int
    is_banned: bool
    ban_reason: str | None = None
    ban_expires_at: datetime | None = None
    created_at: datetime


class AdminStats(BaseModel):
    total_users: int
    new_users_7d: int
    total_threads: int
    total_comments: int
    comments_today: int
    comments_7d: int
    open_reports: int


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor: UserOut | None = None
    action: str
    target_type: Literal["thread", "comment", "user", "category", "report"]
    target_id: int | None = None
    metadata: dict[str, Any] = {}
    created_at: datetime


CommentNode.model_rebuild()
ThreadDetail.model_rebuild()
