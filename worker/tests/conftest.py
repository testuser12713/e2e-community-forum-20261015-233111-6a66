"""Shared fixtures for the worker test suite.

The tests run against the real PostgreSQL database declared as
``DATABASE_URL`` (same as the product); there is no SQLite fallback.
``backend/alembic`` remains the source of truth for the product schema, but the
worker must not import the API package, so the fixture mirrors the worker's own
models onto the database for the tests.
"""

from __future__ import annotations

import pytest
from db import Base, get_engine, get_session_factory
from models import Job
from sqlalchemy import delete
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture(scope="session")
def engine() -> Engine:
    eng = get_engine()
    Base.metadata.create_all(bind=eng, checkfirst=True)
    return eng


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
