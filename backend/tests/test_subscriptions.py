"""Subscription endpoints against PostgreSQL.

Subscribing, reading and unsubscribing through the real routes, using rows this
test creates for itself (its own user, category and thread). No other ticket's
table is reset.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.db import get_session_factory
from app.models import Category, Subscription, Thread, User
from app.security import create_access_token
from app.services import subscriptions as subscriptions_service

SUBSCRIBE_PATH = "/api/v1/threads/{thread_id}/subscription"


@pytest.fixture
def forum() -> Iterator[dict[str, object]]:
    """Create an authoring user, a category and a thread to subscribe to."""
    suffix = uuid.uuid4().hex[:12]
    slug = f"cat-{suffix}"
    session = get_session_factory()()
    try:
        user = User(
            username=f"subscriber_{suffix}",
            email=f"subscriber_{suffix}@example.test",
            password_hash="not-used",
            display_name="Subscriber",
        )
        category = Category(name=f"Category {suffix}", slug=slug)
        session.add_all([user, category])
        session.flush()
        thread = Thread(
            category_id=category.id,
            author_id=user.id,
            title="Subscription thread",
            body_markdown="Body",
        )
        session.add(thread)
        session.commit()
        user_id = user.id
        thread_id = thread.id
    finally:
        session.close()

    yield {
        "user_id": user_id,
        "thread_id": thread_id,
        "headers": {"Authorization": f"Bearer {create_access_token(user_id, 'user')}"},
    }

    cleanup = get_session_factory()()
    try:
        cleanup.execute(delete(Subscription).where(Subscription.user_id == user_id))
        cleanup.execute(delete(Thread).where(Thread.id == thread_id))
        cleanup.execute(delete(Category).where(Category.slug == slug))
        cleanup.execute(delete(User).where(User.id == user_id))
        cleanup.commit()
    finally:
        cleanup.close()


def _path(forum: dict[str, object]) -> str:
    return SUBSCRIBE_PATH.format(thread_id=forum["thread_id"])


def _subscription_rows(thread_id: int) -> int:
    session = get_session_factory()()
    try:
        return session.execute(
            select(func.count())
            .select_from(Subscription)
            .where(Subscription.thread_id == thread_id)
        ).scalar_one()
    finally:
        session.close()


def test_subscribe_then_get_returns_true(client: TestClient, forum: dict[str, object]) -> None:
    response = client.post(_path(forum), headers=forum["headers"])
    assert response.status_code == 204

    state = client.get(_path(forum), headers=forum["headers"])
    assert state.status_code == 200
    assert state.json() == {"subscribed": True}


def test_unsubscribe_then_get_returns_false(client: TestClient, forum: dict[str, object]) -> None:
    assert client.post(_path(forum), headers=forum["headers"]).status_code == 204
    assert client.get(_path(forum), headers=forum["headers"]).json() == {"subscribed": True}

    assert client.delete(_path(forum), headers=forum["headers"]).status_code == 204
    assert client.get(_path(forum), headers=forum["headers"]).json() == {"subscribed": False}


def test_get_before_subscribing_returns_false(client: TestClient, forum: dict[str, object]) -> None:
    state = client.get(_path(forum), headers=forum["headers"])
    assert state.status_code == 200
    assert state.json() == {"subscribed": False}


def test_subscribe_is_idempotent(client: TestClient, forum: dict[str, object]) -> None:
    first = client.post(_path(forum), headers=forum["headers"])
    second = client.post(_path(forum), headers=forum["headers"])
    assert first.status_code == 204
    assert second.status_code == 204
    assert _subscription_rows(forum["thread_id"]) == 1
    assert client.get(_path(forum), headers=forum["headers"]).json() == {"subscribed": True}


def test_unsubscribe_is_idempotent(client: TestClient, forum: dict[str, object]) -> None:
    client.post(_path(forum), headers=forum["headers"])
    first = client.delete(_path(forum), headers=forum["headers"])
    second = client.delete(_path(forum), headers=forum["headers"])
    assert first.status_code == 204
    assert second.status_code == 204
    assert _subscription_rows(forum["thread_id"]) == 0


@pytest.mark.parametrize("method", ["get", "post", "delete"])
def test_endpoints_require_authentication(
    client: TestClient, forum: dict[str, object], method: str
) -> None:
    response = client.request(method.upper(), _path(forum))
    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "unauthorized"


@pytest.mark.parametrize("method", ["get", "post", "delete"])
def test_unknown_thread_answers_404_in_envelope(
    client: TestClient, forum: dict[str, object], method: str
) -> None:
    path = SUBSCRIBE_PATH.format(thread_id=10_000_000)
    response = client.request(method.upper(), path, headers=forum["headers"])
    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "not_found"


def test_subscriber_ids_helper_returns_only_subscribers(
    client: TestClient, forum: dict[str, object]
) -> None:
    client.post(_path(forum), headers=forum["headers"])
    session = get_session_factory()()
    try:
        ids = subscriptions_service.get_subscriber_ids(session, forum["thread_id"])
        assert forum["user_id"] in ids
        assert ids == [forum["user_id"]]
        assert (
            subscriptions_service.get_subscriber_ids(
                session, forum["thread_id"], exclude_user_id=forum["user_id"]
            )
            == []
        )
    finally:
        session.close()
