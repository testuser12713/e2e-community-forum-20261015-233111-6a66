"""Tests for the ``notification.create`` worker handler.

Everything runs against the real PostgreSQL database declared as
``DATABASE_URL`` — no SQLite. Each test provisions its own users, thread and
comment rows and cleans them up afterwards; it leaves every other table alone.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from engine import enqueue_job, process_due
from models import Comment, Job, Notification, Thread, User
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from tests.conftest import CategoryFactory

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
LATER = T0 + timedelta(minutes=5)


class Provisioned:
    """The rows a test needs, plus the ids for their cleanup."""

    def __init__(self, actor: User, target: User, thread: Thread, comment: Comment) -> None:
        self.actor = actor
        self.target = target
        self.thread = thread
        self.comment = comment

    def payload(self, notification_type: str = "reply") -> dict[str, Any]:
        return {
            "user_id": self.target.id,
            "type": notification_type,
            "actor_id": self.actor.id,
            "thread_id": self.thread.id,
            "comment_id": self.comment.id,
        }


def _make_user(db: Session, label: str) -> User:
    token = uuid4().hex[:10]
    user = User(
        username=f"notif_{label}_{token}",
        email=f"notif_{label}_{token}@example.test",
        password_hash="x",
        display_name=label,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture()
def provisioned(db: Session, categories: CategoryFactory) -> Provisioned:
    actor = _make_user(db, "actor")
    target = _make_user(db, "target")
    thread = Thread(
        category_id=categories.create(),
        author_id=actor.id,
        title="Notification handler test thread",
        body_markdown="body",
    )
    db.add(thread)
    db.flush()
    comment = Comment(
        thread_id=thread.id,
        author_id=actor.id,
        depth=1,
        body_markdown="a reply",
    )
    db.add(comment)
    db.flush()
    data = Provisioned(actor, target, thread, comment)
    yield data

    db.rollback()
    user_ids = [data.actor.id, data.target.id]
    thread_ids = [data.thread.id]
    db.execute(
        delete(Notification).where(
            (Notification.user_id.in_(user_ids))
            | (Notification.actor_id.in_(user_ids))
            | (Notification.thread_id.in_(thread_ids))
        )
    )
    db.execute(delete(Comment).where(Comment.thread_id.in_(thread_ids)))
    db.execute(delete(Thread).where(Thread.id.in_(thread_ids)))
    db.execute(delete(User).where(User.id.in_(user_ids)))
    db.commit()
    categories.cleanup()


def test_queued_job_creates_exactly_one_notification(db: Session, provisioned: Provisioned) -> None:
    enqueue_job(db, "notification.create", provisioned.payload(), run_at=T0)
    db.commit()

    processed = process_due(db, "worker-notif", now=LATER)
    assert processed == 1

    notifications = list(
        db.scalars(select(Notification).where(Notification.user_id == provisioned.target.id)).all()
    )
    assert len(notifications) == 1
    notification = notifications[0]
    assert notification.type == "reply"
    assert notification.actor_id == provisioned.actor.id
    assert notification.thread_id == provisioned.thread.id
    assert notification.comment_id == provisioned.comment.id
    assert notification.is_read is False

    # The unread counter of the target user counts this one unread row.
    unread = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == provisioned.target.id,
            Notification.is_read.is_(False),
        )
    )
    assert unread == 1


def test_same_payload_twice_does_not_duplicate(db: Session, provisioned: Provisioned) -> None:
    payload = provisioned.payload()
    enqueue_job(db, "notification.create", payload, run_at=T0)
    enqueue_job(db, "notification.create", payload, run_at=T0)
    db.commit()

    process_due(db, "worker-notif", now=LATER)

    # Both jobs are processed; the existence check keeps the row count at one.
    rows = list(
        db.scalars(select(Notification).where(Notification.user_id == provisioned.target.id)).all()
    )
    assert len(rows) == 1


def test_missing_target_user_skips_insert_and_completes_job(
    db: Session, categories: CategoryFactory
) -> None:
    actor = _make_user(db, "actor")
    category_id = categories.create()
    thread = Thread(
        category_id=category_id,
        author_id=actor.id,
        title="orphan target",
        body_markdown="",
    )
    db.add(thread)
    db.flush()
    payload = {
        "user_id": 2_000_000_123,
        "type": "mention",
        "actor_id": actor.id,
        "thread_id": thread.id,
        "comment_id": None,
    }
    enqueue_job(db, "notification.create", payload, run_at=T0)
    db.commit()

    try:
        processed = process_due(db, "worker-notif", now=LATER)
        assert processed == 1
        rows = db.scalars(select(Notification).where(Notification.thread_id == thread.id)).all()
        assert list(rows) == []
        job = db.scalar(select(Job).where(Job.kind == "notification.create"))
        assert job is not None and job.status == "done"
    finally:
        db.rollback()
        db.execute(delete(Notification).where(Notification.actor_id == actor.id))
        db.execute(delete(Thread).where(Thread.author_id == actor.id))
        db.execute(delete(User).where(User.id == actor.id))
        db.commit()
        categories.cleanup()
