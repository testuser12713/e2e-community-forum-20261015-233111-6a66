"""Engagement side effects: mentions, replies and thread subscribers.

Runs against the real PostgreSQL database (see ``conftest.py``). Every test
provisions its own rows inside one session and rolls the session back, so no
data outlives the test and no table another ticket owns is reset.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Job, Subscription, Thread, User
from app.services.engagement import on_content_created
from app.services.jobs import NOTIFICATION_CREATE, THREAD_HOT_SCORE


@pytest.fixture
def db() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        display_name=username,
    )
    db.add(user)
    db.flush()
    return user


def _make_thread(db: Session, author: User) -> Thread:
    suffix = uuid.uuid4().hex
    category = Category(name=f"cat-{suffix}", slug=f"cat-{suffix}", position=0)
    db.add(category)
    db.flush()
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="Thread",
        body_markdown="body",
    )
    db.add(thread)
    db.flush()
    return thread


def _make_comment(db: Session, thread: Thread, author: User | None) -> Comment:
    comment = Comment(
        thread_id=thread.id,
        author_id=author.id if author is not None else None,
        body_markdown="comment",
        depth=1,
    )
    db.add(comment)
    db.flush()
    return comment


def _notification_jobs(db: Session) -> list[Job]:
    return list(
        db.scalars(select(Job).where(Job.kind == NOTIFICATION_CREATE).order_by(Job.id)).all()
    )


def test_mention_enqueues_one_job_for_that_user(db: Session) -> None:
    author = _make_user(db, "alice")
    mentioned = _make_user(db, "bob")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="Hello @bob, take a look!",
        parent_author_id=None,
    )

    jobs = _notification_jobs(db)
    assert len(jobs) == 1
    payload = jobs[0].payload
    assert payload["user_id"] == mentioned.id
    assert payload["type"] == "mention"
    assert payload["actor_id"] == author.id
    assert payload["thread_id"] == thread.id
    assert payload["comment_id"] == comment.id


def test_unknown_mention_enqueues_nothing_and_does_not_fail(db: Session) -> None:
    author = _make_user(db, "alice")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="Hello @nobody-here, are you real?",
        parent_author_id=None,
    )

    assert _notification_jobs(db) == []


def test_subscriber_gets_thread_comment_job(db: Session) -> None:
    author = _make_user(db, "alice")
    subscriber = _make_user(db, "carol")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)
    db.add(Subscription(user_id=subscriber.id, thread_id=thread.id))
    db.flush()

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="No mentions here.",
        parent_author_id=None,
    )

    jobs = _notification_jobs(db)
    assert [job.payload["user_id"] for job in jobs] == [subscriber.id]
    assert jobs[0].payload["type"] == "thread_comment"


def test_reply_enqueues_reply_job_for_parent_author(db: Session) -> None:
    author = _make_user(db, "alice")
    parent_author = _make_user(db, "dave")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="Answering the question.",
        parent_author_id=parent_author.id,
    )

    jobs = _notification_jobs(db)
    assert len(jobs) == 1
    assert jobs[0].payload["user_id"] == parent_author.id
    assert jobs[0].payload["type"] == "reply"


def test_author_is_never_notified_about_their_own_content(db: Session) -> None:
    author = _make_user(db, "alice")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)
    db.add(Subscription(user_id=author.id, thread_id=thread.id))
    db.flush()

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="I mention myself @alice.",
        parent_author_id=author.id,
    )

    assert _notification_jobs(db) == []


def test_only_one_job_per_user_with_the_most_specific_type(db: Session) -> None:
    author = _make_user(db, "alice")
    mentioned = _make_user(db, "bob")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)
    db.add(Subscription(user_id=mentioned.id, thread_id=thread.id))
    db.flush()

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="Hello @bob.",
        parent_author_id=None,
    )

    jobs = _notification_jobs(db)
    assert len(jobs) == 1
    assert jobs[0].payload["user_id"] == mentioned.id
    assert jobs[0].payload["type"] == "mention"


def test_comment_enqueues_hot_score_recalculation(db: Session) -> None:
    author = _make_user(db, "alice")
    thread = _make_thread(db, author)
    comment = _make_comment(db, thread, author)

    on_content_created(
        db,
        author_id=author.id,
        thread_id=thread.id,
        comment_id=comment.id,
        markdown="No mentions.",
        parent_author_id=None,
    )

    hot_jobs = list(db.scalars(select(Job).where(Job.kind == THREAD_HOT_SCORE)).all())
    assert len(hot_jobs) == 1
    assert hot_jobs[0].payload["thread_ids"] == [thread.id]
