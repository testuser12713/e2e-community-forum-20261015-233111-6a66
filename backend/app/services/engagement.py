"""Content-creation side effects (mentions, replies, subscribers).

The signature is the shared contract the thread and comment tickets call; the
body is filled by the engagement ticket. Keeping it here — complete and empty —
is what lets every feature ticket depend on this skeleton alone.

Nothing here commits: the caller's writing transaction owns the unit of work,
so the notification and hot-score jobs become visible only when the content row
that produced them does.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Subscription, User
from app.services.jobs import NOTIFICATION_CREATE, THREAD_HOT_SCORE, enqueue_job

# A mention is ``@name`` in the Markdown source (never in the rendered HTML),
# with the ``@`` not preceded by another word character (so ``a@b`` is an
# e-mail, not a mention). Usernames are at most 32 characters long.
_MENTION_RE = re.compile(r"(?<![A-Za-z0-9_@])@([A-Za-z0-9_-]{1,32})")

NOTIFICATION_REPLY = "reply"
NOTIFICATION_MENTION = "mention"
NOTIFICATION_THREAD_COMMENT = "thread_comment"

# When one user qualifies for several reasons the most specific one wins, so a
# reply target that is also a subscriber gets ``reply`` and a mentioned
# subscriber gets ``mention`` — one job per user per event, never two.
_PRIORITY: dict[str, int] = {
    NOTIFICATION_THREAD_COMMENT: 1,
    NOTIFICATION_MENTION: 2,
    NOTIFICATION_REPLY: 3,
}


def _mentioned_usernames(markdown: str) -> list[str]:
    """Return the distinct usernames referenced as ``@name`` in the source."""
    seen: dict[str, None] = {}
    for match in _MENTION_RE.finditer(markdown or ""):
        # SQLAlchemy's ``in_`` may be used directly; keep insertion order.
        seen.setdefault(match.group(1), None)
    return list(seen)


def on_content_created(
    db: Session,
    *,
    author_id: int,
    thread_id: int,
    comment_id: int | None,
    markdown: str,
    parent_author_id: int | None,
) -> None:
    """Enqueue notification and hot-score jobs for freshly created content."""
    recipients: dict[int, str] = {}

    def add_recipient(user_id: int | None, notification_type: str) -> None:
        if user_id is None or user_id == author_id:
            return
        current = recipients.get(user_id)
        if current is None or _PRIORITY[notification_type] > _PRIORITY[current]:
            recipients[user_id] = notification_type

    usernames = _mentioned_usernames(markdown)
    if usernames:
        mentioned_ids = db.scalars(select(User.id).where(User.username.in_(usernames))).all()
        for mentioned_id in mentioned_ids:
            add_recipient(mentioned_id, NOTIFICATION_MENTION)

    add_recipient(parent_author_id, NOTIFICATION_REPLY)

    subscriber_ids = db.scalars(
        select(Subscription.user_id).where(Subscription.thread_id == thread_id)
    ).all()
    for subscriber_id in subscriber_ids:
        add_recipient(subscriber_id, NOTIFICATION_THREAD_COMMENT)

    for user_id, notification_type in recipients.items():
        enqueue_job(
            db,
            NOTIFICATION_CREATE,
            {
                "user_id": user_id,
                "type": notification_type,
                "actor_id": author_id,
                "thread_id": thread_id,
                "comment_id": comment_id,
            },
        )

    enqueue_job(db, THREAD_HOT_SCORE, {"thread_ids": [thread_id]})
