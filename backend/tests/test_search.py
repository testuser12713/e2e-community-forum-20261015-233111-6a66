"""Full-text search acceptance against real PostgreSQL (AC-19, AC-20, AC-37).

The keyword used here appears in no thread title — only in the bodies — so a
hit proves a body search. IDs and slugs carry a random suffix so parallel
branches never collide, and the fixture removes exactly the rows it created.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.db import get_session_factory
from app.models import Category, Thread, User

KEYWORD = "zwiebelfisch"


@pytest.fixture
def seeded(client: TestClient) -> Iterator[dict[str, Any]]:
    """Create two categories, one author and three matching threads."""
    session = get_session_factory()()
    suffix = uuid4().hex[:10]
    try:
        category_a = Category(name=f"Suche A {suffix}", slug=f"suche-a-{suffix}", position=0)
        category_b = Category(name=f"Suche B {suffix}", slug=f"suche-b-{suffix}", position=1)
        author = User(
            username=f"searcher_{suffix}",
            email=f"searcher_{suffix}@example.test",
            password_hash="not-used",
            display_name="Search Author",
        )
        session.add_all([category_a, category_b, author])
        session.flush()

        frequent = Thread(
            category_id=category_a.id,
            author_id=author.id,
            title="Reisfeld Rezept",
            body_markdown=f"Der {KEYWORD} schwimmt. {KEYWORD} {KEYWORD}.",
            tags=["vintage"],
        )
        once_a = Thread(
            category_id=category_a.id,
            author_id=author.id,
            title="Kurzer Beitrag",
            body_markdown=f"Genau ein {KEYWORD}.",
            tags=[],
        )
        once_b = Thread(
            category_id=category_b.id,
            author_id=author.id,
            title="Andere Kategorie",
            body_markdown=f"Auch ein {KEYWORD}.",
            tags=["sommer"],
        )
        session.add_all([frequent, once_a, once_b])
        session.commit()

        data = {
            "category_a": category_a.slug,
            "category_b": category_b.slug,
            "frequent": frequent.id,
            "once_a": once_a.id,
            "once_b": once_b.id,
            "thread_ids": [frequent.id, once_a.id, once_b.id],
            "category_ids": [category_a.id, category_b.id],
            "author_id": author.id,
        }
        yield data
    finally:
        thread_ids = [frequent.id, once_a.id, once_b.id]
        session.execute(Thread.__table__.delete().where(Thread.id.in_(thread_ids)))
        session.execute(
            Category.__table__.delete().where(Category.id.in_([category_a.id, category_b.id]))
        )
        session.execute(User.__table__.delete().where(User.id == author.id))
        session.commit()
        session.close()


def _search(client: TestClient, **params: Any) -> Any:
    return client.get("/api/v1/search", params=params)


def test_finds_word_that_occurs_only_in_thread_body(
    client: TestClient, seeded: dict[str, Any]
) -> None:
    response = _search(client, q=KEYWORD)
    assert response.status_code == 200
    found = {item["id"] for item in response.json()["items"]}
    assert found == set(seeded["thread_ids"])


def test_category_filter_narrows_hits(client: TestClient, seeded: dict[str, Any]) -> None:
    response = _search(client, q=KEYWORD, category=seeded["category_a"])
    assert response.status_code == 200
    found = {item["id"] for item in response.json()["items"]}
    assert found == {seeded["frequent"], seeded["once_a"]}
    assert seeded["once_b"] not in found


def test_tag_filter_narrows_hits(client: TestClient, seeded: dict[str, Any]) -> None:
    response = _search(client, q=KEYWORD, tag="vintage")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == [seeded["frequent"]]


def test_category_and_tag_filters_combine(client: TestClient, seeded: dict[str, Any]) -> None:
    response = _search(client, q=KEYWORD, category=seeded["category_b"], tag="vintage")
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_results_are_ordered_by_relevance(client: TestClient, seeded: dict[str, Any]) -> None:
    response = _search(client, q=KEYWORD)
    assert response.status_code == 200
    items = response.json()["items"]
    assert items[0]["id"] == seeded["frequent"]


def test_missing_q_answers_422_in_envelope(client: TestClient) -> None:
    response = _search(client)
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "validation_error"


def test_page_envelope_and_beyond_last_page(client: TestClient, seeded: dict[str, Any]) -> None:
    response = _search(client, q=KEYWORD, per_page=1)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "total", "pages"}
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert body["total"] == 3
    assert body["pages"] == 3
    assert len(body["items"]) == 1

    beyond = _search(client, q=KEYWORD, page=99, per_page=1)
    assert beyond.status_code == 200
    assert beyond.json()["items"] == []


def test_no_match_answers_empty_page(client: TestClient) -> None:
    response = _search(client, q="einwortdasnichtvorkommtxyz")
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0
