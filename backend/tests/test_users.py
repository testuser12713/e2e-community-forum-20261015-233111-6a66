"""User profile routes: public profile, profile editing and the profile lists.

Everything runs against the real PostgreSQL database the suite is configured
with; the fixture creates only the rows this file owns and removes them again.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Thread, User
from app.security import create_access_token, hash_password

_PASSWORD = "Correct-Horse-Battery-1!"


class Context:
    """A session plus the rows it created, so teardown removes only those."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.users: list[User] = []
        self.categories: list[Category] = []
        self._seq = 0

    def unique(self, prefix: str) -> str:
        self._seq += 1
        return f"{prefix}-{id(self):x}-{self._seq}"

    def user(self, **overrides: object) -> User:
        name = self.unique("profileuser")
        user = User(
            username=name,
            email=f"{name}@example.test",
            password_hash=hash_password(_PASSWORD),
            display_name=overrides.pop("display_name", "Profile User"),
            bio=overrides.pop("bio", None),
            avatar_url=overrides.pop("avatar_url", None),
            role=overrides.pop("role", "user"),
            karma=overrides.pop("karma", 0),
            **overrides,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        self.users.append(user)
        return user

    def category(self) -> Category:
        slug = self.unique("cat")
        category = Category(name=slug, slug=slug, position=0)
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        self.categories.append(category)
        return category

    def thread(
        self, author: User, category: Category, *, title: str, comment_count: int = 0
    ) -> Thread:
        thread = Thread(
            category_id=category.id,
            author_id=author.id,
            title=title,
            body_markdown="Body text",
            tags=[],
            score=0,
            comment_count=comment_count,
            created_at=datetime.now(UTC),
            last_activity_at=datetime.now(UTC),
        )
        self.db.add(thread)
        self.db.commit()
        self.db.refresh(thread)
        return thread

    def comment(self, author: User, thread: Thread, body: str) -> Comment:
        comment = Comment(
            thread_id=thread.id,
            author_id=author.id,
            parent_id=None,
            depth=1,
            body_markdown=body,
            score=0,
            created_at=datetime.now(UTC) + timedelta(seconds=self._seq),
        )
        self._seq += 1
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        return comment

    def token(self, user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


@pytest.fixture
def ctx() -> Iterator[Context]:
    db = get_session_factory()()
    context = Context(db)
    try:
        yield context
    finally:
        user_ids = [user.id for user in context.users]
        category_ids = [category.id for category in context.categories]
        if user_ids:
            db.execute(delete(Comment).where(Comment.author_id.in_(user_ids)))
            db.execute(delete(Thread).where(Thread.author_id.in_(user_ids)))
            db.execute(delete(User).where(User.id.in_(user_ids)))
        if category_ids:
            db.execute(delete(Thread).where(Thread.category_id.in_(category_ids)))
            db.execute(delete(Category).where(Category.id.in_(category_ids)))
        db.commit()
        db.close()


def _assert_envelope(body: dict[str, object]) -> None:
    assert set(body) == {"error"}
    error = body["error"]
    assert isinstance(error, dict)
    assert set(error) == {"code", "message", "details"}


def test_unknown_username_answers_404_in_envelope(client: TestClient, ctx: Context) -> None:
    response = client.get(f"/api/v1/users/{ctx.unique('ghost')}")
    assert response.status_code == 404
    body = response.json()
    _assert_envelope(body)
    assert body["error"]["code"] == "not_found"


def test_unknown_username_list_answers_404(client: TestClient, ctx: Context) -> None:
    ghost = ctx.unique("ghost")
    assert client.get(f"/api/v1/users/{ghost}/threads").status_code == 404
    assert client.get(f"/api/v1/users/{ghost}/comments").status_code == 404


def test_public_profile_shows_bio_karma_and_created_at(client: TestClient, ctx: Context) -> None:
    user = ctx.user(bio="Hello there", karma=7, avatar_url="https://example.test/a.png")
    response = client.get(f"/api/v1/users/{user.username}")
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == user.username
    assert body["display_name"] == "Profile User"
    assert body["bio"] == "Hello there"
    assert body["karma"] == 7
    assert body["avatar_url"] == "https://example.test/a.png"
    assert body["created_at"]


def test_get_me_returns_own_profile(client: TestClient, ctx: Context) -> None:
    user = ctx.user(karma=3)
    response = client.get("/api/v1/users/me", headers=ctx.token(user))
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == user.username
    assert body["email"] == user.email
    assert body["role"] == "user"
    assert body["karma"] == 3
    assert body["is_banned"] is False


def test_get_me_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401
    _assert_envelope(response.json())


def test_patch_me_saves_display_name_bio_and_avatar(client: TestClient, ctx: Context) -> None:
    user = ctx.user()
    response = client.patch(
        "/api/v1/users/me",
        headers=ctx.token(user),
        json={
            "display_name": "Neuer Name",
            "bio": "Meine Bio",
            "avatar_url": "https://example.test/new.png",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Neuer Name"
    assert body["bio"] == "Meine Bio"
    assert body["avatar_url"] == "https://example.test/new.png"

    ctx.db.refresh(user)
    assert user.display_name == "Neuer Name"
    assert user.bio == "Meine Bio"
    assert user.avatar_url == "https://example.test/new.png"

    public = client.get(f"/api/v1/users/{user.username}")
    assert public.json()["bio"] == "Meine Bio"


def test_patch_me_leaves_omitted_fields_untouched(client: TestClient, ctx: Context) -> None:
    user = ctx.user(bio="Keep me")
    response = client.patch(
        "/api/v1/users/me", headers=ctx.token(user), json={"display_name": "Only Name"}
    )
    assert response.status_code == 200
    assert response.json()["bio"] == "Keep me"


def test_patch_me_bio_over_500_answers_422_in_envelope(client: TestClient, ctx: Context) -> None:
    user = ctx.user()
    response = client.patch("/api/v1/users/me", headers=ctx.token(user), json={"bio": "x" * 501})
    assert response.status_code == 422
    body = response.json()
    _assert_envelope(body)
    assert body["error"]["code"] == "validation_error"
    fields = {detail["field"] for detail in body["error"]["details"]}
    assert "bio" in fields


def test_patch_me_requires_authentication(client: TestClient) -> None:
    response = client.patch("/api/v1/users/me", json={"display_name": "X"})
    assert response.status_code == 401
    _assert_envelope(response.json())


def test_user_threads_answer_page_envelope(client: TestClient, ctx: Context) -> None:
    user = ctx.user()
    category = ctx.category()
    for index in range(3):
        ctx.thread(user, category, title=f"Thread {index}", comment_count=index)

    first = client.get(f"/api/v1/users/{user.username}/threads?page=1&per_page=2")
    assert first.status_code == 200
    body = first.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["per_page"] == 2
    assert body["pages"] == 2
    assert len(body["items"]) == 2
    item = body["items"][0]
    assert item["author"]["username"] == user.username
    assert item["category"]["slug"] == category.slug
    assert item["comment_count"] == 2  # newest thread first

    second = client.get(f"/api/v1/users/{user.username}/threads?page=2&per_page=2")
    assert len(second.json()["items"]) == 1

    beyond = client.get(f"/api/v1/users/{user.username}/threads?page=99&per_page=2")
    assert beyond.status_code == 200
    assert beyond.json()["items"] == []
    assert beyond.json()["total"] == 3


def test_user_comments_answer_page_envelope(client: TestClient, ctx: Context) -> None:
    user = ctx.user()
    category = ctx.category()
    thread = ctx.thread(user, category, title="A thread")
    for index in range(3):
        ctx.comment(user, thread, body=f"Comment {index}")

    first = client.get(f"/api/v1/users/{user.username}/comments?page=1&per_page=2")
    assert first.status_code == 200
    body = first.json()
    assert body["total"] == 3
    assert body["pages"] == 2
    assert len(body["items"]) == 2
    assert body["items"][0]["thread_title"] == "A thread"
    assert body["items"][0]["body_markdown"].startswith("Comment")

    second = client.get(f"/api/v1/users/{user.username}/comments?page=2&per_page=2")
    assert len(second.json()["items"]) == 1

    beyond = client.get(f"/api/v1/users/{user.username}/comments?page=5&per_page=2")
    assert beyond.status_code == 200
    assert beyond.json()["items"] == []


def test_profile_lists_do_not_include_other_users_content(client: TestClient, ctx: Context) -> None:
    owner = ctx.user()
    other = ctx.user()
    category = ctx.category()
    ctx.thread(owner, category, title="Mine")
    ctx.thread(other, category, title="Theirs")

    body = client.get(f"/api/v1/users/{owner.username}/threads").json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Mine"
