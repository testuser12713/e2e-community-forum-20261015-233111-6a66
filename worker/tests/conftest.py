"""Shared fixtures for the worker test suite.

The tests run against the real PostgreSQL database declared as
``DATABASE_URL`` (same as the product); there is no SQLite fallback.
``backend/alembic`` remains the source of truth for the product schema, but the
worker must not import the API package, so the fixture mirrors the worker's own
models onto the database for the tests.

One table is not in the worker's own models but is required by the real schema:
``thread.category_id`` carries the ``thread_category_id_fkey`` foreign key to
``category``. The tests create threads pointing at ``DEFAULT_CATEGORY_ID``, so
this module mirrors the ``category`` table as well and seeds that one row.
"""

from __future__ import annotations

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
    select,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

# The category id every thread-creating test points at. It is seeded once per
# session, so the ``thread_category_id_fkey`` constraint is satisfied.
DEFAULT_CATEGORY_ID = 1

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


@pytest.fixture(scope="session")
def engine() -> Engine:
    eng = get_engine()
    Base.metadata.create_all(bind=eng, checkfirst=True)
    return eng


@pytest.fixture(scope="session", autouse=True)
def seed_default_category(engine: Engine) -> None:
    """Guarantee ``DEFAULT_CATEGORY_ID`` exists for every thread insert."""
    with engine.begin() as conn:
        exists = conn.scalar(
            select(category_table.c.id).where(category_table.c.id == DEFAULT_CATEGORY_ID)
        )
        if exists is None:
            conn.execute(
                insert(category_table)
                .values(
                    id=DEFAULT_CATEGORY_ID,
                    name="Worker Test Category",
                    slug="worker-test-category",
                    description=None,
                    position=0,
                )
                .on_conflict_do_nothing(index_elements=["id"])
            )


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
