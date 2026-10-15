"""Database engine, session factory and the ``get_db`` dependency.

SQLAlchemy 2.0 against PostgreSQL only. The schema is created by Alembic
(``alembic upgrade head``); this module never calls ``create_all``.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

from alembic.config import Config as AlembicConfig
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.config import get_settings

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Return the process-wide engine, creating it on first use."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            future=True,
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Return the process-wide session factory, creating it on first use."""
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
    return _session_factory


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a session and closing it afterwards."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def reset_engine() -> None:
    """Dispose of the engine and session factory (used by tests)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


def alembic_config() -> AlembicConfig:
    """Build an Alembic config rooted at the backend directory."""
    backend_dir = Path(__file__).resolve().parent.parent
    config = AlembicConfig(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", get_settings().database_url)
    return config


def run_migrations() -> None:
    """Bring the database schema to ``head`` with Alembic.

    Called from the application lifespan so a freshly started process works
    against an empty database without any manual migration step.
    """
    command.upgrade(alembic_config(), "head")


def dispose_engine() -> None:
    """Close pooled connections without discarding the engine."""
    if _engine is not None:
        _engine.dispose()


def session_scope() -> Any:  # pragma: no cover - convenience for scripts
    """Context manager returning a committed session."""
    from contextlib import contextmanager

    @contextmanager
    def _scope() -> Iterator[Session]:
        session = get_session_factory()()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    return _scope()
