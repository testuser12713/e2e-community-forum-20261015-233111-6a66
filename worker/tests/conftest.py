"""Shared fixtures for the worker test suite.

The tests run against the real PostgreSQL database declared as
``DATABASE_URL`` (same as the product); there is no SQLite fallback.
``backend/alembic`` remains the source of truth for the product schema, but the
worker must not import the API package, so the fixture mirrors the worker's own
models onto the database for the tests.

One table is not in the worker's own models but is required by the real schema:
``thread.category_id`` carries the ``thread_category_id_fkey`` foreign key to
``category``. A thread cannot be inserted without a matching ``category`` row,
so this module mirrors the ``category`` table (making ``create_all`` build it on
a completely empty database) and hands every thread-creating test a factory that
provisions its own category and removes it again — the same "provision and clean
up only what you created" pattern the backend suites use.
"""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from db import Base, get_engine, get_session_factory
from models import Job
from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    Table,
    Text,
    delete,
    func,
    insert,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

# Test-side mirror of the migration's ``category`` table. Defining it on the
# shared metadata makes ``create_all`` build it on a completely empty database;
# when the real schema already exists the ``checkfirst`` create is a no-op.
category_table = Table(
    "category",
    Base.metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String(80), nullable=False, unique=True),
    Column("slug", String(80), nullable=False, unique=True),
    Column("description", Text),
    Column("position", Integer, nullable=False, server_default="0"),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    ),
)


class CategoryFactory:
    """Creates category rows for a single test and deletes exactly those rows.

    The backend suites provision their own category per test; the worker mirrors
    that. A created row is flushed (so the caller's ``Thread`` insert sees it)
    but not committed, so a test that rolls its transaction back leaves nothing
    behind; a test that commits calls :meth:`cleanup` after it has removed the
    threads that referenced the category.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._ids: list[int] = []

    def create(self) -> int:
        """Insert a fresh category and return its id."""
        suffix = uuid4().hex[:10]
        category_id = self._db.execute(
            insert(category_table)
            .values(
                name=f"Worker Test Category {suffix}",
                slug=f"worker-test-category-{suffix}",
                description=None,
                position=0,
            )
            .returning(category_table.c.id)
        ).scalar_one()
        self._ids.append(category_id)
        return category_id

    def cleanup(self) -> None:
        """Delete every category this factory created and commit."""
        if not self._ids:
            return
        self._db.execute(delete(category_table).where(category_table.c.id.in_(self._ids)))
        self._db.commit()
        self._ids.clear()


@pytest.fixture(scope="session")
def engine() -> Engine:
    eng = get_engine()
    Base.metadata.create_all(bind=eng, checkfirst=True)
    return eng


@pytest.fixture()
def categories(db: Session) -> Iterator[CategoryFactory]:
    """A per-test category factory bound to the test's session."""
    yield CategoryFactory(db)


@pytest.fixture()
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return get_session_factory()


@pytest.fixture()
def db(session_factory: sessionmaker[Session]) -> Session:
    session = session_factory()
    session.execute(delete(Job))
    session.commit()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
