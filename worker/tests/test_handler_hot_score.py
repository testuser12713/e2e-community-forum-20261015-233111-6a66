"""Tests for the ``thread.hot_score`` handler.

The suite runs against the real PostgreSQL database declared as
``DATABASE_URL`` (no SQLite), like the rest of the worker tests. Every test
provisions its own user and thread rows inside the test transaction; the
transaction is rolled back afterwards, so nothing of this module leaks into
other tests.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from handlers import hot_score
from models import Thread, User
from sqlalchemy import select
from sqlalchemy.orm import Session

SENTINEL = -999.0


def _make_user(db: Session) -> User:
    suffix = uuid.uuid4().hex[:10]
    user = User(
        username=f"user_{suffix}",
        email=f"{suffix}@example.com",
        password_hash="x",
        display_name=f"User {suffix}",
    )
    db.add(user)
    db.flush()
    return user


def _make_thread(
    db: Session,
    author: User,
    *,
    score: int,
    age_days: float,
    hot_score_value: float = 0.0,
    is_locked: bool = False,
    deleted: bool = False,
) -> Thread:
    now = datetime.now(UTC)
    thread = Thread(
        category_id=1,
        author_id=author.id,
        title="Thread",
        body_markdown="Body",
        score=score,
        hot_score=hot_score_value,
        is_locked=is_locked,
        created_at=now - timedelta(days=age_days),
        last_activity_at=now - timedelta(days=age_days),
        deleted_at=now - timedelta(days=1) if deleted else None,
    )
    db.add(thread)
    db.flush()
    return thread


def test_newer_thread_with_fewer_votes_outranks_older_with_more(db: Session) -> None:
    author = _make_user(db)
    older = _make_thread(db, author, score=500, age_days=30)
    newer = _make_thread(db, author, score=2, age_days=0)
    db.flush()

    hot_score.handle(db, {"thread_ids": None})
    db.expire_all()

    older_row = db.get(Thread, older.id)
    newer_row = db.get(Thread, newer.id)
    assert older_row is not None and newer_row is not None
    assert newer_row.hot_score > older_row.hot_score
    assert newer_row.hot_score > 0


def test_payload_thread_ids_restricts_the_update(db: Session) -> None:
    author = _make_user(db)
    targeted = _make_thread(db, author, score=10, age_days=1, hot_score_value=SENTINEL)
    untouched = _make_thread(db, author, score=10, age_days=1, hot_score_value=SENTINEL)
    db.flush()

    hot_score.handle(db, {"thread_ids": [targeted.id]})
    db.expire_all()

    targeted_row = db.get(Thread, targeted.id)
    untouched_row = db.get(Thread, untouched.id)
    assert targeted_row is not None and untouched_row is not None
    assert targeted_row.hot_score != SENTINEL
    assert untouched_row.hot_score == SENTINEL


def test_soft_deleted_threads_are_not_touched(db: Session) -> None:
    author = _make_user(db)
    deleted = _make_thread(db, author, score=10, age_days=1, hot_score_value=SENTINEL, deleted=True)
    live = _make_thread(db, author, score=10, age_days=1, hot_score_value=SENTINEL)
    db.flush()

    hot_score.handle(db, {"thread_ids": None})
    db.expire_all()

    deleted_row = db.get(Thread, deleted.id)
    live_row = db.get(Thread, live.id)
    assert deleted_row is not None and live_row is not None
    assert deleted_row.hot_score == SENTINEL
    assert live_row.hot_score != SENTINEL


def test_locked_threads_stay_live_and_are_recomputed(db: Session) -> None:
    author = _make_user(db)
    locked = _make_thread(db, author, score=7, age_days=2, hot_score_value=SENTINEL, is_locked=True)
    db.flush()

    hot_score.handle(db, {"thread_ids": None})
    db.expire_all()

    locked_row = db.get(Thread, locked.id)
    assert locked_row is not None
    assert locked_row.hot_score != SENTINEL


def test_empty_thread_ids_updates_nothing(db: Session) -> None:
    author = _make_user(db)
    thread = _make_thread(db, author, score=10, age_days=1, hot_score_value=SENTINEL)
    db.flush()

    hot_score.handle(db, {"thread_ids": []})
    db.expire_all()

    row = db.get(Thread, thread.id)
    assert row is not None
    assert row.hot_score == SENTINEL


def test_handler_is_registered_for_the_job_kind() -> None:
    from handlers import HANDLERS

    assert HANDLERS["thread.hot_score"] is hot_score.handle


def test_unknown_thread_ids_do_not_raise(db: Session) -> None:
    author = _make_user(db)
    thread = _make_thread(db, author, score=10, age_days=1, hot_score_value=SENTINEL)
    db.flush()

    hot_score.handle(db, {"thread_ids": [thread.id, 10**9]})
    db.expire_all()

    row = db.scalar(select(Thread).where(Thread.id == thread.id))
    assert row is not None
    assert row.hot_score != SENTINEL
