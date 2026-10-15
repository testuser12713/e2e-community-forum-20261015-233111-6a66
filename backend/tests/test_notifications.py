"""Notifications API against PostgreSQL.

Covers the ticket's promises: the unread count matches the unread rows, marking
one notification read lowers it, marking all sets it to zero, and a foreign
notification cannot be marked read. Rows are written directly because the
worker that produces them lives in its own service.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Notification, Thread, User
from app.security import create_access_token


@pytest.fixture
def db() -> Iterator[Session]:
    """A session; the notification table is reset before each test."""
    session = get_session_factory()()
    try:
        session.execute(delete(Notification))
        session.commit()
        yield session
    finally:
        session.rollback()
        session.close()


def _make_user(db: Session, prefix: str) -> User:
    suffix = uuid.uuid4().hex[:10]
    user = User(
        username=f"{prefix}_{suffix}",
        email=f"{prefix}_{suffix}@example.com",
        password_hash="not-a-real-hash",
        display_name=prefix,
    )
    db.add(user)
    db.flush()
    return user


def _make_thread(db: Session, author: User) -> Thread:
    suffix = uuid.uuid4().hex[:10]
    category = Category(name=f"cat_{suffix}", slug=f"cat-{suffix}", position=0)
    db.add(category)
    db.flush()
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="Notification target",
        body_markdown="body",
    )
    db.add(thread)
    db.flush()
    return thread


def _make_notification(
    db: Session,
    *,
    user: User,
    thread: Thread,
    actor: User,
    is_read: bool,
    kind: str = "reply",
) -> Notification:
    notification = Notification(
        user_id=user.id,
        type=kind,
        actor_id=actor.id,
        thread_id=thread.id,
        is_read=is_read,
    )
    db.add(notification)
    db.flush()
    return notification


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _unread(client: TestClient, user: User) -> int:
    response = client.get("/api/v1/notifications/unread-count", headers=_auth(user))
    assert response.status_code == 200
    return response.json()["unread"]


def test_unread_count_matches_unread_rows(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=True)
    db.commit()

    assert _unread(client, owner) == 2


def test_list_is_newest_first_page_envelope(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=True)
    newest = _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    db.commit()

    response = client.get("/api/v1/notifications", headers=_auth(owner))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "total", "pages"}
    assert (body["page"], body["per_page"], body["total"], body["pages"]) == (1, 20, 3, 1)
    assert [item["id"] for item in body["items"]] == [newest.id, newest.id - 1, newest.id - 2]
    assert body["items"][0]["actor"]["username"] == actor.username


def test_list_only_shows_own_notifications(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    other = _make_user(db, "other")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    mine = _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=other, thread=thread, actor=actor, is_read=False)
    db.commit()

    response = client.get("/api/v1/notifications", headers=_auth(owner))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [mine.id]


def test_page_beyond_last_is_empty(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    db.commit()

    response = client.get("/api/v1/notifications?page=5", headers=_auth(owner))
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 1


def test_mark_read_lowers_count(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    first = _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    db.commit()

    assert _unread(client, owner) == 2
    response = client.post(f"/api/v1/notifications/{first.id}/read", headers=_auth(owner))
    assert response.status_code == 204
    assert _unread(client, owner) == 1

    db.expire_all()
    assert db.get(Notification, first.id).is_read is True


def test_mark_read_is_idempotent(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    notification = _make_notification(db, user=owner, thread=thread, actor=actor, is_read=True)
    db.commit()

    response = client.post(f"/api/v1/notifications/{notification.id}/read", headers=_auth(owner))
    assert response.status_code == 204
    assert _unread(client, owner) == 0


def test_mark_all_read_sets_count_to_zero(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    _make_notification(db, user=owner, thread=thread, actor=actor, is_read=True)
    db.commit()

    assert _unread(client, owner) == 2
    response = client.post("/api/v1/notifications/read-all", headers=_auth(owner))
    assert response.status_code == 204
    assert _unread(client, owner) == 0


def test_foreign_notification_cannot_be_marked_read(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    intruder = _make_user(db, "intruder")
    actor = _make_user(db, "actor")
    thread = _make_thread(db, actor)
    notification = _make_notification(db, user=owner, thread=thread, actor=actor, is_read=False)
    db.commit()

    response = client.post(f"/api/v1/notifications/{notification.id}/read", headers=_auth(intruder))
    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "not_found"

    db.expire_all()
    assert db.get(Notification, notification.id).is_read is False


def test_marking_unknown_notification_answers_404(client: TestClient, db: Session) -> None:
    owner = _make_user(db, "owner")
    db.commit()

    response = client.post("/api/v1/notifications/999999/read", headers=_auth(owner))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_endpoints_require_authentication(client: TestClient, db: Session) -> None:
    for method, path in (
        ("get", "/api/v1/notifications"),
        ("get", "/api/v1/notifications/unread-count"),
        ("post", "/api/v1/notifications/1/read"),
        ("post", "/api/v1/notifications/read-all"),
    ):
        response = client.request(method.upper(), path)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"
