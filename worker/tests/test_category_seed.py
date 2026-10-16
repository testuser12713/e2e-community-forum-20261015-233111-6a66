"""Tests for the default category the worker acceptance seed references.

The acceptance suite inserts its seed thread with ``category_id=1`` and the real
schema enforces ``thread_category_id_fkey``, so the shared fixture must
guarantee that row exists. These tests assert the wiring rather than a
placeholder: the row is present and a thread can actually reference it, and the
per-test factory does not reuse the reserved id.
"""

from __future__ import annotations

import uuid

from models import Thread, User
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from tests.conftest import DEFAULT_CATEGORY_ID, CategoryFactory, category_table


def _make_user(db: Session) -> User:
    suffix = uuid.uuid4().hex[:10]
    user = User(
        username=f"seed_{suffix}",
        email=f"seed_{suffix}@example.test",
        password_hash="x",
        display_name=f"Seed {suffix}",
    )
    db.add(user)
    db.flush()
    return user


def _insert_thread(db: Session, user: User, category_id: int) -> Thread:
    thread = Thread(
        category_id=category_id,
        author_id=user.id,
        title="Seed reference thread",
        body_markdown="Body",
    )
    db.add(thread)
    db.flush()
    return thread


def _cleanup(db: Session, user: User) -> None:
    db.rollback()
    db.execute(delete(Thread).where(Thread.author_id == user.id))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


def test_default_category_row_is_provisioned(db: Session) -> None:
    row = db.execute(
        select(category_table.c.id).where(category_table.c.id == DEFAULT_CATEGORY_ID)
    ).scalar_one_or_none()
    assert row == DEFAULT_CATEGORY_ID


def test_thread_can_reference_the_default_category(db: Session) -> None:
    user = _make_user(db)
    try:
        thread = _insert_thread(db, user, DEFAULT_CATEGORY_ID)
        assert thread.id is not None
    finally:
        _cleanup(db, user)


def test_factory_category_does_not_collide_with_the_default(
    db: Session, categories: CategoryFactory
) -> None:
    category_id = categories.create()
    assert category_id != DEFAULT_CATEGORY_ID
    user = _make_user(db)
    try:
        thread = _insert_thread(db, user, category_id)
        assert thread.id is not None
    finally:
        _cleanup(db, user)
        categories.cleanup()
