"""Thread write and detail behaviour against PostgreSQL.

Each test provisions its own rows (author, other, banned, category) and commits
them so the API's request session sees them; teardown removes exactly the rows
this file created — never a table another ticket owns. The access tokens are
minted directly because register/login belong to another ticket.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Job, Thread, User
from app.security import create_access_token
from app.services.jobs import NOTIFICATION_CREATE, THREAD_HOT_SCORE


@pytest.fixture
def db() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@dataclass
class Env:
    author: User
    other: User
    banned: User
    mentioned: User
    category: Category
    auth: dict[str, str]
    other_auth: dict[str, str]
    banned_auth: dict[str, str]


def _make_user(db: Session, prefix: str, *, banned: bool = False) -> User:
    suffix = uuid.uuid4().hex[:12]
    username = f"{prefix}_{suffix}"
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        display_name=username,
        is_banned=banned,
        ban_reason="Spam" if banned else None,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def env(db: Session) -> Iterator[Env]:
    author = _make_user(db, "author")
    other = _make_user(db, "other")
    banned = _make_user(db, "banned", banned=True)
    mentioned = _make_user(db, "mentioned")
    category = Category(
        name=f"cat_{uuid.uuid4().hex[:12]}",
        slug=f"cat-{uuid.uuid4().hex[:12]}",
        position=0,
    )
    db.add(category)
    db.commit()

    def bearer(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}

    data = Env(
        author=author,
        other=other,
        banned=banned,
        mentioned=mentioned,
        category=category,
        auth=bearer(author),
        other_auth=bearer(other),
        banned_auth=bearer(banned),
    )
    try:
        yield data
    finally:
        user_ids = [author.id, other.id, banned.id, mentioned.id]
        thread_ids = list(db.scalars(select(Thread.id).where(Thread.author_id.in_(user_ids))).all())
        if thread_ids:
            db.execute(
                delete(Job).where(
                    Job.payload["thread_id"].astext.in_([str(tid) for tid in thread_ids])
                )
            )
            for tid in thread_ids:
                db.execute(delete(Job).where(Job.payload["thread_ids"].contains([tid])))
        db.execute(delete(Thread).where(Thread.author_id.in_(user_ids)))
        db.execute(delete(Category).where(Category.id == category.id))
        db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()


def _create_thread(
    client: TestClient,
    env: Env,
    *,
    title: str = "A thread",
    body: str = "Hello **world**",
    tags: list[str] | None = None,
) -> dict:
    response = client.post(
        "/api/v1/threads",
        json={
            "category_id": env.category.id,
            "title": title,
            "body": body,
            "tags": tags if tags is not None else ["intro", "hi"],
        },
        headers=env.auth,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_thread_renders_sanitised_markdown(client: TestClient, env: Env) -> None:
    body = (
        "**bold** <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>"
    )
    detail = _create_thread(client, env, body=body, tags=["safe"])

    assert detail["body_markdown"] == body
    html = detail["body_html"]
    assert "<strong>bold</strong>" in html
    assert "<script>" not in html
    assert "<img" not in html
    assert 'href="javascript:' not in html
    assert "&lt;script&gt;" in html
    assert detail["tags"] == ["safe"]
    assert detail["is_deleted"] is False
    assert detail["edited_at"] is None


def test_create_thread_enqueues_mention_notification_job(
    client: TestClient, env: Env, db: Session
) -> None:
    detail = _create_thread(client, env, body=f"Hello @{env.mentioned.username}, look!")

    jobs = list(db.scalars(select(Job).where(Job.kind == NOTIFICATION_CREATE)).all())
    matching = [job for job in jobs if job.payload["user_id"] == env.mentioned.id]
    assert len(matching) == 1
    assert matching[0].payload["type"] == "mention"
    assert matching[0].payload["thread_id"] == detail["id"]

    hot_jobs = list(db.scalars(select(Job).where(Job.kind == THREAD_HOT_SCORE)).all())
    assert any(job.payload["thread_ids"] == [detail["id"]] for job in hot_jobs)


def test_get_thread_is_public_and_returns_detail(client: TestClient, env: Env) -> None:
    detail = _create_thread(client, env)
    response = client.get(f"/api/v1/threads/{detail['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == detail["id"]
    assert body["category"]["id"] == env.category.id
    assert body["author"]["id"] == env.author.id
    assert body["my_vote"] == 0
    assert body["subscribed"] is False


def test_get_unknown_thread_answers_404_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/threads/99999999")
    assert response.status_code == 404
    payload = response.json()
    assert set(payload) == {"error"}
    assert set(payload["error"]) == {"code", "message", "details"}


def test_create_with_unknown_category_answers_404(client: TestClient, env: Env) -> None:
    response = client.post(
        "/api/v1/threads",
        json={"category_id": 99999999, "title": "x", "body": "y", "tags": []},
        headers=env.auth,
    )
    assert response.status_code == 404


def test_edit_sets_edited_at_and_updates_timestamp(client: TestClient, env: Env) -> None:
    detail = _create_thread(client, env)
    first = client.patch(
        f"/api/v1/threads/{detail['id']}",
        json={"title": "Edited title", "body": "**new** body"},
        headers=env.auth,
    )
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["title"] == "Edited title"
    assert first_body["body_markdown"] == "**new** body"
    assert first_body["edited_at"] is not None
    assert "<strong>new</strong>" in first_body["body_html"]

    time.sleep(0.05)
    second = client.patch(
        f"/api/v1/threads/{detail['id']}",
        json={"body": "third revision"},
        headers=env.auth,
    )
    assert second.status_code == 200
    assert second.json()["edited_at"] > first_body["edited_at"]


def test_edit_by_another_user_is_forbidden(client: TestClient, env: Env) -> None:
    detail = _create_thread(client, env)
    response = client.patch(
        f"/api/v1/threads/{detail['id']}",
        json={"title": "Hijacked"},
        headers=env.other_auth,
    )
    assert response.status_code == 403


def test_delete_soft_deletes_row_and_shows_marker(
    client: TestClient, env: Env, db: Session
) -> None:
    detail = _create_thread(client, env)
    reply = Comment(
        thread_id=detail["id"],
        author_id=env.other.id,
        body_markdown="a reply",
        depth=1,
    )
    db.add(reply)
    db.commit()

    response = client.delete(f"/api/v1/threads/{detail['id']}", headers=env.auth)
    assert response.status_code == 204

    row = db.get(Thread, detail["id"])
    assert row is not None
    assert row.is_deleted is True
    assert row.deleted_at is not None

    # Replies remain visible after the thread is soft-deleted.
    db.expire_all()
    assert db.get(Comment, reply.id) is not None

    detail_response = client.get(f"/api/v1/threads/{detail['id']}")
    assert detail_response.status_code == 200
    deleted = detail_response.json()
    assert deleted["is_deleted"] is True
    assert deleted["body_html"] == "[gelöscht]"


def test_delete_by_another_user_is_forbidden(client: TestClient, env: Env) -> None:
    detail = _create_thread(client, env)
    response = client.delete(f"/api/v1/threads/{detail['id']}", headers=env.other_auth)
    assert response.status_code == 403


def test_create_requires_authentication(client: TestClient, env: Env) -> None:
    response = client.post(
        "/api/v1/threads",
        json={"category_id": env.category.id, "title": "x", "body": "y", "tags": []},
    )
    assert response.status_code == 401


def test_banned_user_write_answers_403_with_reason(client: TestClient, env: Env) -> None:
    response = client.post(
        "/api/v1/threads",
        json={"category_id": env.category.id, "title": "x", "body": "y", "tags": []},
        headers=env.banned_auth,
    )
    assert response.status_code == 403
    payload = response.json()
    assert payload["error"]["code"] == "user_banned"
    assert payload["error"]["details"]["reason"] == "Spam"


def test_missing_title_answers_422_in_envelope(client: TestClient, env: Env) -> None:
    response = client.post(
        "/api/v1/threads",
        json={"category_id": env.category.id, "body": "y", "tags": []},
        headers=env.auth,
    )
    assert response.status_code == 422
    payload = response.json()
    assert set(payload["error"]) == {"code", "message", "details"}
    assert isinstance(payload["error"]["details"], list)
