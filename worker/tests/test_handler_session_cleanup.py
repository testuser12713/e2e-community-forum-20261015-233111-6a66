"""Tests for the ``session.cleanup`` handler against PostgreSQL.

Everything runs against the real PostgreSQL database declared as
``DATABASE_URL`` — no SQLite fallback. The handler removes expired and revoked
refresh tokens with bulk ``DELETE`` statements and leaves valid sessions alone.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from engine import enqueue_job, process_due
from handlers import session_cleanup
from models import RefreshToken, User
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session


def _make_user(db: Session) -> User:
    suffix = uuid.uuid4().hex[:12]
    user = User(
        username=f"scleanup_{suffix}",
        email=f"scleanup_{suffix}@example.com",
        password_hash="not-a-real-hash",
        display_name="Session Cleanup",
    )
    db.add(user)
    db.flush()
    return user


def _make_token(
    db: Session,
    user_id: int,
    *,
    expires_at: datetime,
    revoked: bool = False,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        token_hash=uuid.uuid4().hex,
        family_id=uuid.uuid4().hex,
        expires_at=expires_at,
        revoked=revoked,
    )
    db.add(token)
    db.flush()
    return token


@pytest.fixture()
def sessions(db: Session):
    """A session with the refresh-token table reset around every test."""
    db.execute(delete(RefreshToken))
    db.commit()
    try:
        yield db
    finally:
        db.execute(delete(RefreshToken))
        db.execute(delete(User).where(User.username.like("scleanup_%")))
        db.commit()


def test_handle_deletes_expired_and_revoked_but_keeps_valid(sessions: Session) -> None:
    now = datetime.now(UTC)
    user = _make_user(sessions)
    expired = _make_token(sessions, user.id, expires_at=now - timedelta(minutes=1))
    revoked = _make_token(
        sessions,
        user.id,
        expires_at=now + timedelta(days=30),
        revoked=True,
    )
    valid = _make_token(sessions, user.id, expires_at=now + timedelta(days=30))
    expired_id, revoked_id = expired.id, revoked.id
    valid_hash = valid.token_hash
    sessions.commit()

    session_cleanup.handle(sessions, {})
    sessions.expire_all()

    remaining = sessions.scalars(select(RefreshToken)).all()
    assert len(remaining) == 1
    assert remaining[0].token_hash == valid_hash
    assert sessions.get(RefreshToken, expired_id) is None
    assert sessions.get(RefreshToken, revoked_id) is None


def test_valid_token_survives_and_can_still_refresh(sessions: Session) -> None:
    user = _make_user(sessions)
    valid_hash = _make_token(
        sessions, user.id, expires_at=datetime.now(UTC) + timedelta(days=30)
    ).token_hash
    sessions.commit()

    session_cleanup.handle(sessions, {})
    sessions.expire_all()

    # The same lookup a refresh would perform: the token is present, unrevoked
    # and unexpired, so it remains usable.
    usable = sessions.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == valid_hash,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > datetime.now(UTC),
        )
    )
    assert usable is not None


def test_empty_table_is_not_an_error(sessions: Session) -> None:
    session_cleanup.handle(sessions, {})
    sessions.expire_all()
    assert sessions.scalar(select(RefreshToken)) is None


def test_handle_uses_one_bulk_delete_per_category(sessions: Session) -> None:
    now = datetime.now(UTC)
    user = _make_user(sessions)
    _make_token(sessions, user.id, expires_at=now - timedelta(minutes=1))
    _make_token(
        sessions,
        user.id,
        expires_at=now + timedelta(days=30),
        revoked=True,
    )
    sessions.commit()

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

    engine = sessions.get_bind()
    event.listen(engine, "before_cursor_execute", _capture)
    try:
        session_cleanup.handle(sessions, {})
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    deletes = [s for s in statements if s.lstrip().upper().startswith("DELETE")]
    selects = [
        s
        for s in statements
        if s.lstrip().upper().startswith("SELECT") and "refresh_token" in s.lower()
    ]
    assert len(deletes) == 2
    assert not selects


def test_engine_processes_the_session_cleanup_job(sessions: Session) -> None:
    now = datetime.now(UTC)
    user = _make_user(sessions)
    _make_token(sessions, user.id, expires_at=now - timedelta(minutes=1))
    valid = _make_token(sessions, user.id, expires_at=now + timedelta(days=30))
    valid_hash = valid.token_hash
    sessions.commit()

    enqueue_job(sessions, "session.cleanup", {}, run_at=now)
    sessions.commit()

    processed = process_due(sessions, "worker-cleanup")
    assert processed == 1

    sessions.expire_all()
    remaining = sessions.scalars(select(RefreshToken)).all()
    assert [token.token_hash for token in remaining] == [valid_hash]
