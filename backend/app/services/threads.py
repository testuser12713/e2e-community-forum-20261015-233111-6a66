"""Thread read/write logic behind the thread routes.

Bodies are stored as Markdown source and rendered on the server through
``render_markdown`` so raw HTML is escaped (AC-12). Editing only sets
``edited_at``; deleting is soft — the row stays, ``deleted_at`` is set and the
rendered HTML becomes the contract marker ``[gelöscht]`` (AC-13, AC-14).

Creating a thread runs the shared ``on_content_created`` side effect inside the
same transaction as the insert, so mention/subscriber notification jobs and the
hot-score recalculation are queued with the write (AC-35).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.models import Category, Subscription, Thread, User, Vote
from app.schemas.common import CategoryOut, ThreadDetail, UserOut
from app.services.engagement import on_content_created
from app.services.rendering import render_markdown

#: The literal contract marker a soft-deleted thread shows instead of its body.
DELETED_MARKER = "[gelöscht]"


def _author_out(db: Session, author_id: int) -> UserOut:
    author = db.get(User, author_id)
    if author is None:  # pragma: no cover - FK guarantees the row exists
        raise api_error(404, "Author not found")
    return UserOut.model_validate(author)


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


def build_detail(
    db: Session, thread: Thread, *, current_user_id: int | None = None
) -> ThreadDetail:
    """Shape a ``Thread`` row into the contract ``ThreadDetail``."""
    body_html = DELETED_MARKER if thread.is_deleted else render_markdown(thread.body_markdown)
    return ThreadDetail(
        id=thread.id,
        title=thread.title,
        category=_category_out(db, thread.category_id),
        author=_author_out(db, thread.author_id),
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


def get_thread(db: Session, thread_id: int, *, current_user_id: int | None = None) -> ThreadDetail:
    """Return one thread or answer 404."""
    thread = db.get(Thread, thread_id)
    if thread is None:
        raise api_error(404, "Thread not found")
    return build_detail(db, thread, current_user_id=current_user_id)


def create_thread(
    db: Session,
    *,
    author: User,
    category_id: int,
    title: str,
    body: str,
    tags: list[str],
) -> ThreadDetail:
    """Insert a thread, enqueue its jobs and return the detail."""
    if db.get(Category, category_id) is None:
        raise api_error(404, "Category not found")

    thread = Thread(
        category_id=category_id,
        author_id=author.id,
        title=title,
        body_markdown=body,
        tags=list(tags),
    )
    db.add(thread)
    db.flush()

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=None,
        markdown=body,
        parent_author_id=None,
    )

    db.commit()
    return build_detail(db, thread, current_user_id=author.id)


def update_thread(
    db: Session,
    *,
    thread_id: int,
    user: User,
    title: str | None,
    body: str | None,
    tags: list[str] | None,
) -> ThreadDetail:
    """Edit a thread's own fields; only its author may do so."""
    thread = db.get(Thread, thread_id)
    if thread is None or thread.is_deleted:
        raise api_error(404, "Thread not found")
    if thread.author_id != user.id:
        raise api_error(403, "Only the author may edit this thread")

    changed = False
    if title is not None:
        thread.title = title
        changed = True
    if body is not None:
        thread.body_markdown = body
        changed = True
    if tags is not None:
        thread.tags = list(tags)
        changed = True
    if changed:
        thread.edited_at = datetime.now(UTC)

    db.commit()
    return build_detail(db, thread, current_user_id=user.id)


def delete_thread(db: Session, *, thread_id: int, user: User) -> None:
    """Soft-delete a thread; only its author may do so (AC-14)."""
    thread = db.get(Thread, thread_id)
    if thread is None or thread.is_deleted:
        raise api_error(404, "Thread not found")
    if thread.author_id != user.id:
        raise api_error(403, "Only the author may delete this thread")

    thread.is_deleted = True
    thread.deleted_at = datetime.now(UTC)
    db.commit()
