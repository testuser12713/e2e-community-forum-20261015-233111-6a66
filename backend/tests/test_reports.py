"""Acceptance tests for content reporting (AC-24, AC-37).

The suite runs against real PostgreSQL (see ``conftest``). Every test provisions
its own user, category and reported content and removes exactly the rows it
created, so it never touches another ticket's data.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Report, Thread, User
from app.security import create_access_token, hash_password

PASSWORD = "Correct-Horse-Battery-1!"


@pytest.fixture
def db() -> Iterator[Session]:
    """A session for provisioning and inspecting rows around the API."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


class Factory:
    """Creates the graph a test needs and deletes exactly those rows afterwards."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_ids: list[int] = []
        self.category_ids: list[int] = []
        self.thread_ids: list[int] = []
        self.comment_ids: list[int] = []

    def user(self, *, banned: bool = False, ban_reason: str | None = None) -> User:
        suffix = uuid.uuid4().hex[:8]
        user = User(
            username=f"reporter_{suffix}",
            email=f"reporter_{suffix}@example.com",
            password_hash=hash_password(PASSWORD),
            display_name=f"Reporter {suffix}",
        )
        if banned:
            user.is_banned = True
            user.ban_reason = ban_reason
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        self.user_ids.append(user.id)
        return user

    def thread(self, author: User) -> Thread:
        suffix = uuid.uuid4().hex[:8]
        category = Category(name=f"Cat {suffix}", slug=f"cat-{suffix}", position=0)
        self.db.add(category)
        self.db.flush()
        self.category_ids.append(category.id)
        thread = Thread(
            category_id=category.id,
            author_id=author.id,
            title=f"Thread {suffix}",
            body_markdown="Body",
            tags=[],
        )
        self.db.add(thread)
        self.db.commit()
        self.db.refresh(thread)
        self.thread_ids.append(thread.id)
        return thread

    def comment(self, thread: Thread, author: User) -> Comment:
        comment = Comment(thread_id=thread.id, author_id=author.id, body_markdown="A comment")
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        self.comment_ids.append(comment.id)
        return comment

    def cleanup(self) -> None:
        if self.user_ids:
            self.db.execute(delete(Report).where(Report.reporter_id.in_(self.user_ids)))
        if self.comment_ids:
            self.db.execute(delete(Comment).where(Comment.id.in_(self.comment_ids)))
        if self.thread_ids:
            self.db.execute(delete(Thread).where(Thread.id.in_(self.thread_ids)))
        if self.category_ids:
            self.db.execute(delete(Category).where(Category.id.in_(self.category_ids)))
        if self.user_ids:
            self.db.execute(delete(User).where(User.id.in_(self.user_ids)))
        self.db.commit()


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def test_report_thread_lands_open(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        user = factory.user()
        thread = factory.thread(factory.user())
        response = client.post(
            "/api/v1/reports",
            json={
                "content_type": "thread",
                "content_id": thread.id,
                "reason": "Spam",
                "note": "please review",
            },
            headers=_auth(user),
        )
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "open"
        assert body["content_type"] == "thread"
        assert body["content_id"] == thread.id
        assert body["reason"] == "Spam"
        assert body["note"] == "please review"
        assert body["reporter"]["id"] == user.id
        assert body["resolved_at"] is None
        stored = db.get(Report, body["id"])
        assert stored is not None
        assert stored.status == "open"
        assert stored.reporter_id == user.id
        assert stored.content_id == thread.id
    finally:
        factory.cleanup()


def test_report_comment_lands_open(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        user = factory.user()
        author = factory.user()
        thread = factory.thread(author)
        comment = factory.comment(thread, author)
        response = client.post(
            "/api/v1/reports",
            json={"content_type": "comment", "content_id": comment.id, "reason": "Beleidigung"},
            headers=_auth(user),
        )
        assert response.status_code == 201
        body = response.json()
        assert body["status"] == "open"
        assert body["content_type"] == "comment"
        assert body["content_id"] == comment.id
        assert body["note"] is None
    finally:
        factory.cleanup()


def test_second_open_report_answers_409(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        user = factory.user()
        thread = factory.thread(factory.user())
        payload = {"content_type": "thread", "content_id": thread.id, "reason": "Spam"}
        assert client.post("/api/v1/reports", json=payload, headers=_auth(user)).status_code == 201
        response = client.post("/api/v1/reports", json=payload, headers=_auth(user))
        assert response.status_code == 409
        error = response.json()["error"]
        assert set(error) == {"code", "message", "details"}
        assert error["code"] == "duplicate_report"
    finally:
        factory.cleanup()


def test_banned_user_answers_403_with_reason(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        banned = factory.user(banned=True, ban_reason="Belästigung")
        thread = factory.thread(factory.user())
        response = client.post(
            "/api/v1/reports",
            json={"content_type": "thread", "content_id": thread.id, "reason": "Spam"},
            headers=_auth(banned),
        )
        assert response.status_code == 403
        error = response.json()["error"]
        assert error["code"] == "user_banned"
        assert "Belästigung" in error["message"]
        assert error["details"]["reason"] == "Belästigung"
    finally:
        factory.cleanup()


def test_report_of_missing_content_answers_404(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        user = factory.user()
        response = client.post(
            "/api/v1/reports",
            json={"content_type": "thread", "content_id": 999_999_999, "reason": "Spam"},
            headers=_auth(user),
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "not_found"
    finally:
        factory.cleanup()


def test_unauthenticated_answers_401(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        thread = factory.thread(factory.user())
        response = client.post(
            "/api/v1/reports",
            json={"content_type": "thread", "content_id": thread.id, "reason": "Spam"},
        )
        assert response.status_code == 401
    finally:
        factory.cleanup()


def test_invalid_content_type_answers_422_envelope(client: TestClient, db: Session) -> None:
    factory = Factory(db)
    try:
        user = factory.user()
        response = client.post(
            "/api/v1/reports",
            json={"content_type": "post", "content_id": 1, "reason": "Spam"},
            headers=_auth(user),
        )
        assert response.status_code == 422
        error = response.json()["error"]
        assert error["code"] == "validation_error"
        assert isinstance(error["details"], list)
        assert set(error["details"][0]) == {"field", "message"}
    finally:
        factory.cleanup()
