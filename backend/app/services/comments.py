"""Comment tree reads, creation, editing and soft deletion.

The reply tree is assembled from a single query per thread (one row per
comment, joined with its author), plus one query for the viewer's votes — never
one query per comment. Bodies are rendered to sanitised HTML with the shared
``app.services.rendering`` helper; editing sets ``edited_at`` and a soft delete
keeps the row and answers ``[gelöscht]`` while the replies stay visible.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Comment, Thread, User, Vote
from app.pagination import make_page, normalize_page
from app.schemas.common import CommentNode, UserOut
from app.services.engagement import on_content_created
from app.services.rendering import render_markdown

MAX_DEPTH = 5
DELETED_MARKER = "[gelöscht]"


def _to_node(
    comment: Comment,
    author: User | None,
    my_vote: int,
    replies: list[CommentNode],
) -> CommentNode:
    """Serialise one comment row, hiding the body of a soft-deleted node."""
    if comment.is_deleted:
        body_markdown = DELETED_MARKER
        body_html = DELETED_MARKER
    else:
        body_markdown = comment.body_markdown
        body_html = render_markdown(comment.body_markdown)
    return CommentNode(
        id=comment.id,
        thread_id=comment.thread_id,
        parent_id=comment.parent_id,
        depth=comment.depth,
        author=UserOut.model_validate(author) if author is not None else None,
        body_markdown=body_markdown,
        body_html=body_html,
        score=comment.score,
        my_vote=my_vote,
        is_deleted=comment.is_deleted,
        created_at=comment.created_at,
        edited_at=comment.edited_at,
        replies=replies,
    )


def _viewer_vote(db: Session, comment_id: int, viewer_id: int | None) -> int:
    """Return the viewer's vote on one comment (0 when none or anonymous)."""
    if viewer_id is None:
        return 0
    value = db.scalar(
        select(Vote.value).where(Vote.user_id == viewer_id, Vote.comment_id == comment_id)
    )
    return int(value) if value is not None else 0


def get_thread_or_404(db: Session, thread_id: int) -> Thread:
    """Load a thread or answer the contract's 404 envelope."""
    thread = db.get(Thread, thread_id)
    if thread is None:
        raise api_error(404, "Thread nicht gefunden", code="not_found")
    return thread


def list_comments(
    db: Session,
    thread_id: int,
    *,
    viewer: User | None,
    page: int | None,
    per_page: int | None,
) -> dict:
    """Return a page of root comments with their nested replies (AC-15, AC-19)."""
    get_thread_or_404(db, thread_id)

    rows = db.execute(
        select(Comment, User)
        .outerjoin(User, User.id == Comment.author_id)
        .where(Comment.thread_id == thread_id)
        .order_by(Comment.created_at, Comment.id)
    ).all()

    votes: dict[int, int] = {}
    comment_ids = [comment.id for comment, _ in rows]
    if viewer is not None and comment_ids:
        votes = {
            comment_id: int(value)
            for comment_id, value in db.execute(
                select(Vote.comment_id, Vote.value).where(
                    Vote.user_id == viewer.id,
                    Vote.comment_id.in_(comment_ids),
                )
            ).all()
        }

    children: dict[int | None, list[tuple[Comment, User | None]]] = {}
    for comment, author in rows:
        children.setdefault(comment.parent_id, []).append((comment, author))

    def build(comment: Comment, author: User | None) -> CommentNode:
        replies = [
            build(child, child_author) for child, child_author in children.get(comment.id, [])
        ]
        return _to_node(comment, author, votes.get(comment.id, 0), replies)

    roots = [build(comment, author) for comment, author in children.get(None, [])]

    safe_page, safe_per_page = normalize_page(page, per_page)
    total = len(roots)
    offset = (safe_page - 1) * safe_per_page
    return make_page(roots[offset : offset + safe_per_page], safe_page, safe_per_page, total)


def create_comment(
    db: Session,
    thread_id: int,
    *,
    author: User,
    body: str,
    parent_id: int | None,
) -> CommentNode:
    """Insert a comment (or reply) and run the content side effects (AC-15, AC-35)."""
    thread = get_thread_or_404(db, thread_id)
    if thread.is_deleted:
        raise api_error(404, "Thread nicht gefunden", code="not_found")
    if thread.is_locked:
        raise api_error(403, "Thread ist gesperrt", code="thread_locked")

    depth = 1
    parent_author_id: int | None = None
    if parent_id is not None:
        parent = db.get(Comment, parent_id)
        if parent is None or parent.thread_id != thread_id:
            raise api_error(404, "Kommentar nicht gefunden", code="not_found")
        if parent.depth >= MAX_DEPTH:
            raise api_error(
                400,
                f"Maximale Antworttiefe von {MAX_DEPTH} erreicht",
                code="max_depth",
            )
        depth = parent.depth + 1
        parent_author_id = parent.author_id

    comment = Comment(
        thread_id=thread_id,
        author_id=author.id,
        parent_id=parent_id,
        depth=depth,
        body_markdown=body,
    )
    db.add(comment)
    db.flush()

    thread.comment_count = (thread.comment_count or 0) + 1
    thread.last_activity_at = datetime.now(UTC)

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread_id,
        comment_id=comment.id,
        markdown=body,
        parent_author_id=parent_author_id,
    )
    db.commit()
    db.refresh(comment)
    return _to_node(comment, author, 0, [])


def update_comment(db: Session, comment_id: int, *, user: User, body: str) -> CommentNode:
    """Edit one's own comment, setting ``edited_at`` (AC-13)."""
    comment = db.get(Comment, comment_id)
    if comment is None or comment.is_deleted:
        raise api_error(404, "Kommentar nicht gefunden", code="not_found")
    if comment.author_id != user.id:
        raise api_error(403, "Nur der Autor kann diesen Kommentar bearbeiten")

    comment.body_markdown = body
    comment.edited_at = datetime.now(UTC)
    db.commit()
    db.refresh(comment)

    author = db.get(User, comment.author_id) if comment.author_id else None
    return _to_node(comment, author, _viewer_vote(db, comment.id, user.id), [])


def delete_comment(db: Session, comment_id: int, *, user: User) -> None:
    """Soft-delete one's own comment; replies stay visible (AC-14)."""
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise api_error(404, "Kommentar nicht gefunden", code="not_found")
    if comment.author_id != user.id and user.role not in ("moderator", "admin"):
        raise api_error(403, "Dieser Kommentar kann nicht gelöscht werden")
    if comment.is_deleted:
        return

    comment.is_deleted = True
    comment.deleted_at = datetime.now(UTC)

    thread = db.get(Thread, comment.thread_id)
    if thread is not None and thread.comment_count:
        thread.comment_count = max(thread.comment_count - 1, 0)
    db.commit()
