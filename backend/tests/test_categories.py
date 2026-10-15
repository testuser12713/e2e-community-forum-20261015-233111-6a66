"""Category read API and admin category management (AC-08, AC-19, AC-31, AC-37).

Runs against the real PostgreSQL database from ``DATABASE_URL``. Each test
provisions the users and categories it needs and removes only the rows it
created.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import get_session_factory
from app.models import Category, User
from app.security import create_access_token, hash_password

PASSWORD = "Correct-Horse-Battery-1!"


def _unique_slug() -> str:
    return f"cat-{uuid4().hex[:12]}"


def _unique_name() -> str:
    return f"Category {uuid4().hex[:8]}"


@pytest.fixture
def make_user() -> Iterator[Any]:
    """Factory creating a real user row and its Bearer headers for a role."""
    created: list[int] = []

    def _make(role: str = "user") -> tuple[int, dict[str, str]]:
        username = f"cat{uuid4().hex[:10]}"
        with get_session_factory()() as db:
            user = User(
                username=username,
                email=f"{username}@example.com",
                password_hash=hash_password(PASSWORD),
                display_name=username,
                role=role,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            user_id = user.id
        created.append(user_id)
        token = create_access_token(user_id, role)
        return user_id, {"Authorization": f"Bearer {token}"}

    yield _make

    if created:
        with get_session_factory()() as db:
            for user in db.execute(select(User).where(User.id.in_(created))).scalars():
                db.delete(user)
            db.commit()


@pytest.fixture(autouse=True)
def _cleanup_categories() -> Iterator[None]:
    """Remove only the categories a test created, leaving pre-existing rows."""
    with get_session_factory()() as db:
        before = set(db.execute(select(Category.id)).scalars().all())
    yield
    with get_session_factory()() as db:
        for category in db.execute(select(Category).where(~Category.id.in_(before))).scalars():
            db.delete(category)
        db.commit()


def _create_as_admin(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str | None = None,
    slug: str | None = None,
    position: int = 0,
    description: str | None = None,
) -> dict:
    response = client.post(
        "/api/v1/admin/categories",
        json={
            "name": name or _unique_name(),
            "slug": slug or _unique_slug(),
            "description": description,
            "position": position,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_public_list_is_ordered_by_position(client: TestClient, make_user: Any) -> None:
    _, headers = make_user("admin")
    high = _create_as_admin(client, headers, position=50)
    low = _create_as_admin(client, headers, position=5)

    response = client.get("/api/v1/categories", params={"per_page": 100})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "total", "pages"}

    positions = [category["position"] for category in body["items"]]
    assert positions == sorted(positions)

    ids = [category["id"] for category in body["items"]]
    assert ids.index(low["id"]) < ids.index(high["id"])


def test_public_list_beyond_last_page_is_empty(client: TestClient) -> None:
    response = client.get("/api/v1/categories", params={"page": 9999, "per_page": 20})
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_admin_creates_edits_and_reorders(client: TestClient, make_user: Any) -> None:
    _, headers = make_user("admin")
    slugs = [_unique_slug() for _ in range(3)]
    created = [
        _create_as_admin(client, headers, slug=slugs[index], position=index) for index in range(3)
    ]

    renamed = _unique_name()
    edit = client.patch(
        f"/api/v1/admin/categories/{created[0]['id']}",
        json={"name": renamed, "description": "Neu"},
        headers=headers,
    )
    assert edit.status_code == 200, edit.text
    assert edit.json()["name"] == renamed
    assert edit.json()["description"] == "Neu"

    listing = client.get("/api/v1/categories", params={"per_page": 100}).json()
    all_ids = [category["id"] for category in listing["items"]]
    reversed_ids = list(reversed(all_ids))

    reorder = client.put(
        "/api/v1/admin/categories/order",
        json={"ids": reversed_ids},
        headers=headers,
    )
    assert reorder.status_code == 200, reorder.text
    assert [category["id"] for category in reorder.json()["items"]] == reversed_ids

    public = client.get("/api/v1/categories", params={"per_page": 100}).json()
    assert [category["id"] for category in public["items"]] == reversed_ids
    edited = next(category for category in public["items"] if category["id"] == created[0]["id"])
    assert edited["name"] == renamed

    detail = client.get(f"/api/v1/categories/{slugs[0]}")
    assert detail.status_code == 200
    assert detail.json()["id"] == created[0]["id"]


def test_plain_user_is_forbidden_on_every_admin_route(client: TestClient, make_user: Any) -> None:
    _, admin_headers = make_user("admin")
    existing = _create_as_admin(client, admin_headers)
    _, user_headers = make_user("user")

    create = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique_name(), "slug": _unique_slug(), "position": 0},
        headers=user_headers,
    )
    update = client.patch(
        f"/api/v1/admin/categories/{existing['id']}",
        json={"name": _unique_name()},
        headers=user_headers,
    )
    reorder = client.put(
        "/api/v1/admin/categories/order",
        json={"ids": [existing["id"]]},
        headers=user_headers,
    )

    for response in (create, update, reorder):
        assert response.status_code == 403, response.text
        body = response.json()
        assert set(body) == {"error"}
        assert set(body["error"]) == {"code", "message", "details"}

    assert client.post("/api/v1/admin/categories", json={}).status_code == 401
    assert client.put("/api/v1/admin/categories/order", json={"ids": [1]}).status_code == 401


def test_slug_collision_answers_409(client: TestClient, make_user: Any) -> None:
    _, headers = make_user("admin")
    slug = _unique_slug()
    _create_as_admin(client, headers, slug=slug, name=_unique_name())

    collision = client.post(
        "/api/v1/admin/categories",
        json={"name": _unique_name(), "slug": slug, "position": 1},
        headers=headers,
    )
    assert collision.status_code == 409, collision.text
    assert set(collision.json()) == {"error"}


def test_unknown_slug_and_id_answer_404(client: TestClient, make_user: Any) -> None:
    _, headers = make_user("admin")
    assert client.get("/api/v1/categories/no-such-slug").status_code == 404
    missing = client.patch(
        "/api/v1/admin/categories/99999999",
        json={"name": _unique_name()},
        headers=headers,
    )
    assert missing.status_code == 404, missing.text
    assert set(missing.json()) == {"error"}


def test_reorder_rejects_unknown_id_with_422(client: TestClient, make_user: Any) -> None:
    _, headers = make_user("admin")
    response = client.put(
        "/api/v1/admin/categories/order",
        json={"ids": [99999999]},
        headers=headers,
    )
    assert response.status_code == 422, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert isinstance(body["error"]["details"], list)


def test_create_validation_answers_422_envelope(client: TestClient, make_user: Any) -> None:
    _, headers = make_user("admin")
    response = client.post(
        "/api/v1/admin/categories",
        json={"name": "", "slug": "Not A Slug", "position": 0},
        headers=headers,
    )
    assert response.status_code == 422, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "validation_error"
    fields = {detail["field"] for detail in body["error"]["details"]}
    assert "name" in fields
    assert "slug" in fields
