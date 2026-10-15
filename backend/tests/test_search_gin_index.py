"""The threads full-text GIN index exists after ``alembic upgrade head``.

This is a schema-level assertion on PostgreSQL's catalog, not on the search
endpoint's behaviour (that is ``tests/test_search.py``): it proves the index the
non-functional requirement asks for is really created by the migration chain.
"""

from __future__ import annotations

from sqlalchemy import text

from app.db import get_session_factory

INDEX_NAME = "ix_thread_search_vector_gin"


def test_thread_search_gin_index_is_present() -> None:
    session = get_session_factory()()
    try:
        definition = session.execute(
            text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE schemaname = current_schema() AND indexname = :name"
            ),
            {"name": INDEX_NAME},
        ).scalar_one_or_none()
        assert definition is not None, "the GIN index was not created"
        lowered = definition.lower()
        assert "using gin" in lowered
        assert "to_tsvector" in lowered
        assert "body_markdown" in lowered
    finally:
        session.close()
