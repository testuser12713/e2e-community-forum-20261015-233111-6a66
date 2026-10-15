"""End-to-end tests for the worker's SKIP LOCKED job engine.

Everything runs against the real PostgreSQL database declared as
``DATABASE_URL`` — no SQLite.
"""

from __future__ import annotations

import os
import signal
import threading
import time
from datetime import UTC, datetime, timedelta

import pytest
from engine import (
    compute_backoff,
    enqueue_job,
    process_due,
)
from handlers import HANDLERS, Handler
from models import Job
from scheduler import Scheduler
from sqlalchemy import event, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def _noop(_db: Session, _payload: dict) -> None:
    return None


def test_registry_maps_the_contract_job_kinds() -> None:
    assert set(HANDLERS) == {"notification.create", "thread.hot_score", "session.cleanup"}
    assert all(callable(handler) for handler in HANDLERS.values())


def test_compute_backoff_grows_and_is_capped() -> None:
    first = compute_backoff(1, base=10, cap=1000)
    second = compute_backoff(2, base=10, cap=1000)
    third = compute_backoff(3, base=10, cap=1000)
    assert first == 10
    assert first < second < third
    assert compute_backoff(100, base=10, cap=1000) == 1000
    assert compute_backoff(0, base=10, cap=1000) == 10


def test_process_due_marks_a_successful_job_done(db: Session) -> None:
    seen: list[int] = []
    enqueue_job(db, "test.kind", {"n": 1}, run_at=T0)
    db.commit()

    processed = process_due(
        db,
        "worker-1",
        handlers={"test.kind": lambda _s, payload: seen.append(payload["n"])},
        now=T0,
    )

    assert processed == 1
    assert seen == [1]
    job = db.scalar(select(Job))
    assert job is not None
    assert job.status == "done"
    assert job.attempts == 0
    assert job.locked_at is None
    assert job.locked_by is None


def test_claim_query_uses_for_update_skip_locked(db: Session, engine: Engine) -> None:
    statements: list[str] = []

    def _capture(
        _conn: object,
        _cursor: object,
        statement: str,
        _parameters: object,
        _context: object,
        _executemany: bool,
    ) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        enqueue_job(db, "noop.kind", {}, run_at=T0)
        db.commit()
        process_due(db, "worker-1", handlers={"noop.kind": _noop}, now=T0)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    assert any("FOR UPDATE SKIP LOCKED" in statement for statement in statements)


def test_two_workers_never_process_a_job_twice(
    db: Session, session_factory: sessionmaker[Session]
) -> None:
    total = 40
    for index in range(total):
        enqueue_job(db, "test.kind", {"index": index}, run_at=T0)
    db.commit()

    seen: list[int] = []
    lock = threading.Lock()

    def handler(_db: Session, payload: dict) -> None:
        time.sleep(0.005)
        with lock:
            seen.append(payload["index"])

    handlers: dict[str, Handler] = {"test.kind": handler}
    errors: list[BaseException] = []

    def run_worker(worker_id: str) -> None:
        idle_rounds = 0
        try:
            while idle_rounds < 3:
                session = session_factory()
                try:
                    processed = process_due(session, worker_id, handlers=handlers, limit=4)
                    remaining = session.scalar(
                        select(func.count()).select_from(Job).where(Job.status == "pending")
                    )
                finally:
                    session.close()
                if processed == 0 and not remaining:
                    idle_rounds += 1
                else:
                    idle_rounds = 0
                time.sleep(0.005)
        except BaseException as exc:  # pragma: no cover - surfaced via the assertion below
            errors.append(exc)

    first = threading.Thread(target=run_worker, args=("worker-a",))
    second = threading.Thread(target=run_worker, args=("worker-b",))
    first.start()
    second.start()
    first.join(timeout=60)
    second.join(timeout=60)

    assert not errors, errors
    assert len(seen) == total
    assert len(set(seen)) == total
    db.expire_all()
    done = db.scalar(select(func.count()).select_from(Job).where(Job.status == "done"))
    assert done == total


def test_failing_job_retries_with_growing_backoff_then_fails(db: Session) -> None:
    base = 10.0
    enqueue_job(db, "ok.kind", {}, run_at=T0, max_attempts=1)
    enqueue_job(db, "ok.kind", {}, run_at=T0, max_attempts=1)
    failing = enqueue_job(db, "boom.kind", {}, run_at=T0, max_attempts=3)
    failing_id = failing.id
    db.commit()

    def boom(_db: Session, _payload: dict) -> None:
        raise RuntimeError("kaboom")

    handlers: dict[str, Handler] = {"ok.kind": _noop, "boom.kind": boom}

    process_due(db, "worker-1", handlers=handlers, now=T0, backoff_base=base)

    job = db.get(Job, failing_id)
    assert job is not None
    assert job.status == "pending"
    assert job.attempts == 1
    assert job.last_error is not None and "kaboom" in job.last_error
    first_delay = (job.run_at - T0).total_seconds()
    assert first_delay == pytest.approx(base, rel=0.01)

    db.expire_all()
    done = db.scalar(select(func.count()).select_from(Job).where(Job.status == "done"))
    assert done == 2

    second_time = job.run_at + timedelta(seconds=1)
    process_due(db, "worker-1", handlers=handlers, now=second_time, backoff_base=base)

    db.expire_all()
    job = db.get(Job, failing_id)
    assert job is not None
    assert job.status == "pending"
    assert job.attempts == 2
    second_delay = (job.run_at - second_time).total_seconds()
    assert second_delay == pytest.approx(2 * base, rel=0.01)
    assert second_delay > first_delay

    third_time = job.run_at + timedelta(seconds=1)
    process_due(db, "worker-1", handlers=handlers, now=third_time, backoff_base=base)

    db.expire_all()
    job = db.get(Job, failing_id)
    assert job is not None
    assert job.status == "failed"
    assert job.attempts == 3
    assert job.last_error is not None and "kaboom" in job.last_error
    assert job.locked_at is None
    assert job.locked_by is None


def test_run_once_processes_the_due_jobs(
    db: Session, session_factory: sessionmaker[Session]
) -> None:
    from main import run_once

    enqueue_job(db, "notification.create", {"user_id": 1}, run_at=T0)
    db.commit()

    scheduler = Scheduler(hot_score_interval=99999, session_cleanup_interval=99999)
    processed = run_once(session_factory, "worker-once", scheduler)

    assert processed >= 1
    db.expire_all()
    job = db.scalar(select(Job).where(Job.kind == "notification.create"))
    assert job is not None
    assert job.status == "done"


def test_sigterm_sets_the_stop_event_and_the_loop_exits(
    session_factory: sessionmaker[Session],
) -> None:
    import main

    stop_event = threading.Event()
    previous = main.install_signal_handlers(stop_event)
    try:
        os.kill(os.getpid(), signal.SIGTERM)
        assert stop_event.wait(2.0) is True
    finally:
        main.restore_signal_handlers(previous)

    scheduler = Scheduler(hot_score_interval=99999, session_cleanup_interval=99999)
    started = time.monotonic()
    main.run_loop(
        session_factory,
        "worker-sigterm",
        scheduler,
        poll_interval=0.01,
        stop_event=stop_event,
    )
    assert time.monotonic() - started < 5
