"""Feed acceptance: the three orderings, filters and paging (AC-18, AC-19, AC-37).

Runs against the real PostgreSQL database built by ``alembic upgrade head`` in
``conftest``. Every test seeds its own user, category and threads and removes
exactly the rows it wrote, so sibling tickets are untouched.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.db import get_session_factory
from app.models import Category, Thread, User
from app.services import ranking


@pytest.fixture
def seed() -> Any:
    """Create an isolated user + category and a thread factory for this test."""
    session = get_session_factory()()
    suffix = uuid4().hex[:10]
    user = User(
        username=f"feed_{suffix}",
        email=f"feed_{suffix}@example.com",
        password_hash="not-a-real-hash",
        display_name="Feed Tester",
    )
    category = Category(name=f"feed-cat-{suffix}", slug=f"feed-cat-{suffix}", position=0)
    session.add_all([user, category])
    session.commit()

    def make_thread(**overrides: Any) -> Thread:
        now = datetime.now(UTC)
        values: dict[str, Any] = {
            "category_id": category.id,
            "author_id": user.id,
            "title": "A thread",
            "body_markdown": "Body",
            "tags": [],
            "score": 0,
            "comment_count": 0,
            "hot_score": 0.0,
            "created_at": now,
            "last_activity_at": now,
        }
        values.update(overrides)
        thread = Thread(**values)
        session.add(thread)
        session.commit()
        return thread

    namespace = SimpleNamespace(
        session=session,
        user=user,
        category=category,
        slug=category.slug,
        make_thread=make_thread,
    )
    yield namespace

    session.rollback()
    session.execute(delete(Thread).where(Thread.author_id == user.id))
    session.execute(delete(Category).where(Category.id == category.id))
    session.execute(delete(User).where(User.id == user.id))
    session.commit()
    session.close()


def _ids(response: Any) -> list[int]:
    return [item["id"] for item in response.json()["items"]]


def test_sort_new_orders_by_creation_time(client: Any, seed: Any) -> None:
    now = datetime.now(UTC)
    oldest = seed.make_thread(created_at=now - timedelta(hours=3))
    middle = seed.make_thread(created_at=now - timedelta(hours=2))
    newest = seed.make_thread(created_at=now - timedelta(hours=1))

    response = client.get("/api/v1/threads", params={"sort": "new", "category": seed.slug})
    assert response.status_code == 200
    assert _ids(response) == [newest.id, middle.id, oldest.id]


def test_sort_top_orders_by_score(client: Any, seed: Any) -> None:
    low = seed.make_thread(score=1)
    high = seed.make_thread(score=20)
    mid = seed.make_thread(score=7)

    response = client.get("/api/v1/threads", params={"sort": "top", "category": seed.slug})
    assert response.status_code == 200
    assert _ids(response) == [high.id, mid.id, low.id]


def test_sort_hot_orders_by_hot_score(client: Any, seed: Any) -> None:
    cold = seed.make_thread(hot_score=1.5)
    hot = seed.make_thread(hot_score=9.25)
    warm = seed.make_thread(hot_score=4.0)

    response = client.get("/api/v1/threads", params={"sort": "hot", "category": seed.slug})
    assert response.status_code == 200
    assert _ids(response) == [hot.id, warm.id, cold.id]


def test_hot_recompute_lets_newer_thread_outrank_older_with_more_votes(
    client: Any, seed: Any
) -> None:
    now = datetime.now(UTC)
    older = seed.make_thread(score=100, created_at=now - timedelta(hours=200))
    newer = seed.make_thread(score=2, created_at=now - timedelta(minutes=30))

    updated = ranking.recompute_hot_scores(seed.session, [older.id, newer.id], now=now)
    assert set(updated) == {older.id, newer.id}
    seed.session.refresh(older)
    seed.session.refresh(newer)
    assert newer.hot_score > older.hot_score

    response = client.get("/api/v1/threads", params={"sort": "hot", "category": seed.slug})
    assert response.status_code == 200
    assert _ids(response) == [newer.id, older.id]


def test_category_filter(client: Any, seed: Any) -> None:
    other_suffix = uuid4().hex[:10]
    other = Category(
        name=f"feed-other-{other_suffix}", slug=f"feed-other-{other_suffix}", position=1
    )
    seed.session.add(other)
    seed.session.commit()
    seed.session.add(
        Thread(
            category_id=other.id,
            author_id=seed.user.id,
            title="Other",
            body_markdown="Body",
            tags=[],
            created_at=datetime.now(UTC),
            last_activity_at=datetime.now(UTC),
        )
    )
    seed.session.commit()
    mine = seed.make_thread(title="Mine")

    response = client.get("/api/v1/threads", params={"category": seed.slug})
    assert response.status_code == 200
    assert _ids(response) == [mine.id]

    seed.session.execute(delete(Thread).where(Thread.category_id == other.id))
    seed.session.execute(delete(Category).where(Category.id == other.id))
    seed.session.commit()


def test_tag_filter(client: Any, seed: Any) -> None:
    tagged = seed.make_thread(tags=["alpha", "beta"])
    seed.make_thread(tags=["gamma"])

    response = client.get("/api/v1/threads", params={"category": seed.slug, "tag": "alpha"})
    assert response.status_code == 200
    assert _ids(response) == [tagged.id]


def test_paging_beyond_the_last_page_returns_empty_items(client: Any, seed: Any) -> None:
    seed.make_thread(created_at=datetime.now(UTC) - timedelta(hours=1))
    seed.make_thread(created_at=datetime.now(UTC) - timedelta(hours=2))
    seed.make_thread(created_at=datetime.now(UTC) - timedelta(hours=3))

    response = client.get(
        "/api/v1/threads",
        params={"category": seed.slug, "per_page": 2, "page": 99},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["page"] == 99
    assert body["per_page"] == 2
    assert body["total"] == 3
    assert body["pages"] == 2


def test_page_envelope_and_second_page(client: Any, seed: Any) -> None:
    now = datetime.now(UTC)
    first = seed.make_thread(created_at=now - timedelta(hours=1))
    second = seed.make_thread(created_at=now - timedelta(hours=2))
    third = seed.make_thread(created_at=now - timedelta(hours=3))

    response = client.get(
        "/api/v1/threads",
        params={"category": seed.slug, "per_page": 2, "page": 2, "sort": "new"},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "total", "pages"}
    assert _ids(response) == [third.id]

    page_one = client.get(
        "/api/v1/threads",
        params={"category": seed.slug, "per_page": 2, "page": 1, "sort": "new"},
    )
    assert _ids(page_one) == [first.id, second.id]


def test_thread_summary_fields_are_complete(client: Any, seed: Any) -> None:
    thread = seed.make_thread(tags=["alpha"], score=5, comment_count=3, title="Hello")

    response = client.get("/api/v1/threads", params={"category": seed.slug})
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["id"] == thread.id
    assert item["title"] == "Hello"
    assert item["tags"] == ["alpha"]
    assert item["score"] == 5
    assert item["comment_count"] == 3
    assert item["author"]["username"] == seed.user.username
    assert item["category"]["slug"] == seed.slug
    assert item["is_deleted"] is False


def test_invalid_sort_answers_422_in_shared_envelope(client: Any) -> None:
    response = client.get("/api/v1/threads", params={"sort": "banana"})
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "validation_error"
    assert isinstance(body["error"]["details"], list)
    assert body["error"]["details"][0]["field"] == "sort"
