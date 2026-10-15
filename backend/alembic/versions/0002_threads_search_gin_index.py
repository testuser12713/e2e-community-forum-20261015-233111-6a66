"""threads full-text search GIN index

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-15 22:10:00.000000

The spec's non-functional requirement asks for database access with suitable
indexes (full-text GIN, votes, job table). The API skeleton's initial migration
carries no full-text GIN index, so this follow-up migration adds one over the
threads' full-text vector.

The indexed expression is exactly the one ``app.services.search.search_vector``
queries: ``to_tsvector('english', title || ' ' || body_markdown)``. The text
search configuration (``english``) is kept in sync with that module's
``TS_CONFIG``. Plain DDL only; no new column, no data and no secret.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "ix_thread_search_vector_gin"
TABLE_NAME = "thread"
VECTOR_EXPRESSION = "to_tsvector('english', title || ' ' || body_markdown)"


def upgrade() -> None:
    op.execute(f"CREATE INDEX {INDEX_NAME} ON {TABLE_NAME} USING gin ({VECTOR_EXPRESSION})")


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {INDEX_NAME}")
