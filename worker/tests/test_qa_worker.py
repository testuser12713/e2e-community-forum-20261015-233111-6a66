"""QA acceptance suite for the worker's core behaviour.

The worker is built ticket by ticket. On this branch the job engine, the
scheduler and the ``notification.create`` and ``thread.hot_score`` handlers are
implemented; ``session.cleanup`` is still a declared stub (its body performs no
product work yet) and is therefore not asserted on.

Everything runs against the real PostgreSQL database declared as
``DATABASE_URL`` — no SQLite. Each test provisions its own rows and removes
exactly those it created, leaving other tickets' tables alone.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from engine import UnknownJobKindError, enqueue_job, process_due
from models import Job, Notification, Thread, User
from scheduler import Scheduler
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from tests.conftest import CategoryFactory

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def _noop(_db: Session, _payload: dict) -> None:
    return None


@pytest.fixture(autouse=True)
def _leave_no_jobs_behind(db: Session) -> Iterator[None]:
    """Remove every job row this module touched after each test.

    The queue table is shared with the rest of the product; leaving committed
    jobs behind would make another suite that counts jobs flaky. Cleaning up
    after each test keeps this module self-contained.
    """
    try:
        yield
    finally:
        db.rollback()
        db.execute(delete(Job))
        db.commit()


# --------------------------------------------------------------- scheduler


def test_scheduler_enqueues_both_periodic_kinds_once(db: Session) -> None:
    scheduler = Scheduler(hot_score_interval=300, session_cleanup_interval=3600)

    first = scheduler.enqueue_due(db, now=T0)
    db.flush()
    assert set(first) == {"thread.hot_score", "session.cleanup"}

    # Still outstanding (pending) and same instant: nothing is enqueued again,
    # so a short poll loop cannot flood the queue.
    assert scheduler.enqueue_due(db, now=T0) == []

    kinds = list(db.scalars(select(Job.kind).order_by(Job.kind)).all())
    assert kinds.count("session.cleanup") == 1
    assert kinds.count("thread.hot_score") == 1
    jobs = list(db.scalars(select(Job)).all())
    assert all(job.status == "pending" for job in jobs)


def test_scheduler_re_enqueues_only_after_the_previous_job_finished(db: Session) -> None:
    scheduler = Scheduler(hot_score_interval=300, session_cleanup_interval=3600)
    scheduler.enqueue_due(db, now=T0)
    db.flush()

    for job in db.scalars(select(Job)).all():
        job.status = "done"
    db.flush()

    later = T0 + timedelta(seconds=400)
    enqueued = scheduler.enqueue_due(db, now=later)
    # The hot-score interval elapsed; the cleanup interval has not.
    assert enqueued == ["thread.hot_score"]


def test_scheduler_intervals_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HOT_SCORE_INTERVAL", "60")
    monkeypatch.setenv("SESSION_CLEANUP_INTERVAL", "120")
    scheduler = Scheduler.from_env()
    assert scheduler.hot_score_interval == 60
    assert scheduler.session_cleanup_interval == 120


# ------------------------------------------------------------------- engine


def test_due_in_the_future_is_not_claimed(db: Session) -> None:
    enqueue_job(db, "test.kind", {}, run_at=T0 + timedelta(hours=1))
    db.commit()

    processed = process_due(db, "worker-qa", handlers={"test.kind": _noop}, now=T0)

    assert processed == 0
    job = db.scalar(select(Job))
    assert job is not None
    assert job.status == "pending"


def test_the_claim_limit_is_honoured(db: Session) -> None:
    for index in range(5):
        enqueue_job(db, "test.kind", {"index": index}, run_at=T0)
    db.commit()

    processed = process_due(db, "worker-qa", handlers={"test.kind": _noop}, limit=2, now=T0)

    assert processed == 2
    done = db.scalar(select(func.count()).select_from(Job).where(Job.status == "done"))
    assert done == 2


def test_a_job_without_a_handler_fails_after_its_attempts(db: Session) -> None:
    enqueue_job(db, "totally.unknown.kind", {}, run_at=T0, max_attempts=2)
    db.commit()

    process_due(db, "worker-qa", now=T0)
    job = db.scalar(select(Job))
    assert job is not None
    assert job.status == "pending"
    assert job.attempts == 1
    assert job.last_error is not None

    process_due(db, "worker-qa", now=job.run_at + timedelta(seconds=1))
    db.expire_all()
    job = db.scalar(select(Job))
    assert job is not None
    assert job.status == "failed"
    assert job.attempts == 2


def test_unknown_job_kind_error_names_the_kind() -> None:
    error = UnknownJobKindError("mystery.kind")
    assert error.kind == "mystery.kind"
    assert "mystery.kind" in str(error)


# ----------------------------------------- real handlers through the engine


class _Provisioned:
    def __init__(self, user: User, thread: Thread) -> None:
        self.user = user
        self.thread = thread
        self.user_ids = [user.id]
        self.thread_ids = [thread.id]

    def cleanup(self, db: Session) -> None:
        db.rollback()
        db.execute(delete(Notification).where(Notification.user_id.in_(self.user_ids)))
        db.execute(delete(Thread).where(Thread.id.in_(self.thread_ids)))
        db.execute(delete(User).where(User.id.in_(self.user_ids)))
        db.commit()


@pytest.fixture()
def provisioned(db: Session, categories: CategoryFactory) -> Iterator[_Provisioned]:
    suffix = uuid.uuid4().hex[:10]
    user = User(
        username=f"qa_worker_{suffix}",
        email=f"qa_worker_{suffix}@example.test",
        password_hash="x",
        display_name=f"QA {suffix}",
    )
    db.add(user)
    db.flush()
    # A thread cannot be inserted without a matching category row: the real
    # schema carries ``thread_category_id_fkey``. Provision one for this test
    # and remove exactly that row again — never assume a fixed id like ``1``.
    thread = Thread(
        category_id=categories.create(),
        author_id=user.id,
        title="Worker QA thread",
        body_markdown="Body",
        hot_score=-999.0,
    )
    db.add(thread)
    db.flush()
    data = _Provisioned(user, thread)
    try:
        yield data
    finally:
        data.cleanup(db)
        categories.cleanup()


def test_engine_turns_a_notification_job_into_a_row(db: Session, provisioned: _Provisioned) -> None:
    enqueue_job(
        db,
        "notification.create",
        {
            "user_id": provisioned.user.id,
            "type": "reply",
            "actor_id": provisioned.user.id,
            "thread_id": provisioned.thread.id,
            "comment_id": None,
        },
        run_at=T0,
    )
    db.commit()

    processed = process_due(db, "worker-qa", now=T0 + timedelta(minutes=1))
    assert processed == 1

    notification = db.scalar(
        select(Notification).where(Notification.user_id == provisioned.user.id)
    )
    assert notification is not None
    assert notification.type == "reply"
    assert notification.actor_id == provisioned.user.id
    assert notification.thread_id == provisioned.thread.id
    assert notification.comment_id is None
    assert notification.is_read is False

    job = db.scalar(select(Job).where(Job.kind == "notification.create"))
    assert job is not None
    assert job.status == "done"


def test_engine_recomputes_the_hot_score_job(db: Session, provisioned: _Provisioned) -> None:
    enqueue_job(db, "thread.hot_score", {"thread_ids": [provisioned.thread.id]}, run_at=T0)
    db.commit()

    processed = process_due(db, "worker-qa", now=T0 + timedelta(minutes=1))
    assert processed == 1

    db.expire_all()
    thread = db.get(Thread, provisioned.thread.id)
    assert thread is not None
    # The sentinel set by the fixture is replaced by a computed score.
    assert thread.hot_score != -999.0

    job = db.scalar(select(Job).where(Job.kind == "thread.hot_score"))
    assert job is not None
    assert job.status == "done"


def test_engine_produces_one_notification_per_distinct_event(
    db: Session, provisioned: _Provisioned
) -> None:
    for notification_type in ("reply", "mention"):
        enqueue_job(
            db,
            "notification.create",
            {
                "user_id": provisioned.user.id,
                "type": notification_type,
                "actor_id": provisioned.user.id,
                "thread_id": provisioned.thread.id,
                "comment_id": None,
            },
            run_at=T0,
        )
    db.commit()

    processed = process_due(db, "worker-qa", now=T0 + timedelta(minutes=1))
    assert processed == 2

    rows = list(
        db.scalars(select(Notification).where(Notification.user_id == provisioned.user.id)).all()
    )
    assert {row.type for row in rows} == {"reply", "mention"}


def test_engine_leaves_no_due_job_pending_after_a_successful_run(
    db: Session, provisioned: _Provisioned
) -> None:
    enqueue_job(db, "thread.hot_score", {"thread_ids": [provisioned.thread.id]}, run_at=T0)
    db.commit()

    process_due(db, "worker-qa", now=T0 + timedelta(minutes=1))

    pending = db.scalar(
        select(func.count()).select_from(Job).where(Job.status.in_(("pending", "running")))
    )
    assert pending == 0
