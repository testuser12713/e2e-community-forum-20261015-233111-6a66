"""Test configuration: PostgreSQL only, schema created via Alembic.

The suite runs against the real PostgreSQL database named by ``DATABASE_URL``
and brings its schema to ``head`` with ``alembic upgrade head``. There is no
SQLite fallback anywhere.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Iterator

# The API requires a signing key but never ships one; generate a throwaway one
# for the test process before the app module is imported.
os.environ.setdefault("SECRET_KEY", secrets.token_hex(32))
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")

import pytest
from fastapi.testclient import TestClient

from app.db import run_migrations
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _database_schema() -> Iterator[None]:
    """Build the schema once for the whole session with Alembic."""
    run_migrations()
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A TestClient that runs the application lifespan (config + migrations)."""
    with TestClient(app) as test_client:
        yield test_client
