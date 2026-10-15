"""Content-creation side effects (mentions, replies, subscribers).

The signature is the shared contract the thread and comment tickets call; the
body is filled by the engagement ticket. Keeping it here — complete and empty —
is what lets every feature ticket depend on this skeleton alone.
"""

from __future__ import annotations

from sqlalchemy.orm import Session


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
    return None
