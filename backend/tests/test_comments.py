"""Nested comments: creation, nesting, editing, soft delete and locking.

Runs against the real PostgreSQL database (see ``conftest.py``). Each test
provisions its own category, users and thread with committed rows and removes
exactly those rows again, so nothing it did not write is reset.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Job, Notification, Subscription, Thread, User, Vote
from app.security import create_access_token
from app.services.jobs import NOTIFICATION_CREATE, THREAD_HOT_SCORE


@pytest.fixture
def db() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def _user(session: Session, username: str, role: str = "user") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        display_name=username,
        role=role,
    )
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def forum(client: TestClient) -> Iterator[SimpleNamespace]:
    session = get_session_factory()()
    suffix = uuid.uuid4().hex[:8]
    category = Category(name=f"cat-{suffix}", slug=f"cat-{suffix}", position=0)
    session.add(category)
    session.flush()

    author = _user(session, f"author_{suffix}")
    other = _user(session, f"other_{suffix}")

    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="Thread",
        body_markdown="body",
    )
    session.add(thread)
    session.commit()

    namespace = SimpleNamespace(
        session=session,
        category_id=category.id,
        author=author,
        other=other,
        thread_id=thread.id,
        author_headers={"Authorization": f"Bearer {create_access_token(author.id, 'user')}"},
        other_headers={"Authorization": f"Bearer {create_access_token(other.id, 'user')}"},
    )
    try:
        yield namespace
    finally:
        session.rollback()
        session.execute(
            delete(Job).where(
                or_(
                    Job.payload["thread_id"].astext == str(thread.id),
                    Job.payload["thread_ids"].astext == f"[{thread.id}]",
                )
            )
        )
        session.execute(delete(Vote).where(Vote.thread_id == thread.id))
        session.execute(delete(Comment).where(Comment.thread_id == thread.id))
        session.execute(delete(Subscription).where(Subscription.thread_id == thread.id))
        session.execute(delete(Notification).where(Notification.thread_id == thread.id))
        session.execute(delete(Thread).where(Thread.id == thread.id))
        session.execute(delete(Category).where(Category.id == category.id))
        session.execute(delete(User).where(User.id.in_([author.id, other.id])))
        session.commit()
        session.close()


def _post(
    client: TestClient,
    thread_id: int,
    headers: dict[str, str],
    body: str,
    parent_id: int | None = None,
):
    return client.post(
        f"/api/v1/threads/{thread_id}/comments",
        json={"body": body, "parent_id": parent_id},
        headers=headers,
    )


def test_create_root_comment_renders_and_sanitises_markdown(
    client: TestClient, forum: SimpleNamespace
) -> None:
    response = _post(
        client,
        forum.thread_id,
        forum.author_headers,
        "**fett** <script>alert(1)</script> [x](javascript:alert(1))",
    )
    assert response.status_code == 201
    node = response.json()
    assert node["thread_id"] == forum.thread_id
    assert node["parent_id"] is None
    assert node["depth"] == 1
    assert node["is_deleted"] is False
    assert node["edited_at"] is None
    assert node["my_vote"] == 0
    assert node["replies"] == []
    assert "<strong>fett</strong>" in node["body_html"]
    assert "<script>" not in node["body_html"]

    listing = client.get(f"/api/v1/threads/{forum.thread_id}/comments")
    assert listing.status_code == 200
    page = listing.json()
    assert set(page) == {"items", "page", "per_page", "total", "pages"}
    assert page["total"] == 1
    assert page["pages"] == 1
    assert len(page["items"]) == 1
    assert page["items"][0]["id"] == node["id"]


def test_replies_nest_to_depth_five_and_depth_six_is_rejected(
    client: TestClient, forum: SimpleNamespace
) -> None:
    current = _post(client, forum.thread_id, forum.author_headers, "level 1").json()
    ids = [current["id"]]
    assert current["depth"] == 1
    for level in range(2, 6):
        response = _post(
            client, forum.thread_id, forum.author_headers, f"level {level}", current["id"]
        )
        assert response.status_code == 201, response.text
        current = response.json()
        assert current["depth"] == level
        ids.append(current["id"])

    too_deep = _post(client, forum.thread_id, forum.author_headers, "level 6", current["id"])
    assert too_deep.status_code == 400
    error = too_deep.json()["error"]
    assert error["code"] == "max_depth"
    assert "5" in error["message"]
    assert "tiefe" in error["message"].lower()

    roots = client.get(f"/api/v1/threads/{forum.thread_id}/comments").json()["items"]
    assert len(roots) == 1
    node = roots[0]
    depth_seen = 1
    while node["replies"]:
        node = node["replies"][0]
        depth_seen += 1
    assert depth_seen == 5


def test_locked_thread_rejects_new_comment_but_reading_works(
    client: TestClient, forum: SimpleNamespace
) -> None:
    _post(client, forum.thread_id, forum.author_headers, "before the lock")

    thread = forum.session.get(Thread, forum.thread_id)
    thread.is_locked = True
    forum.session.commit()

    listing = client.get(f"/api/v1/threads/{forum.thread_id}/comments")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    blocked = _post(client, forum.thread_id, forum.author_headers, "during the lock")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "thread_locked"


def test_edit_sets_edited_at_and_a_second_edit_updates_the_timestamp(
    client: TestClient, forum: SimpleNamespace
) -> None:
    created = _post(client, forum.thread_id, forum.author_headers, "original").json()
    comment_id = created["id"]

    first = client.patch(
        f"/api/v1/comments/{comment_id}", json={"body": "first edit"}, headers=forum.author_headers
    )
    assert first.status_code == 200
    first_node = first.json()
    assert first_node["body_markdown"] == "first edit"
    assert first_node["edited_at"] is not None

    time.sleep(0.01)
    second = client.patch(
        f"/api/v1/comments/{comment_id}", json={"body": "second edit"}, headers=forum.author_headers
    )
    assert second.status_code == 200
    second_node = second.json()
    assert second_node["body_markdown"] == "second edit"
    assert second_node["edited_at"] >= first_node["edited_at"]


def test_edit_of_another_users_comment_is_forbidden(
    client: TestClient, forum: SimpleNamespace
) -> None:
    created = _post(client, forum.thread_id, forum.author_headers, "mine").json()
    response = client.patch(
        f"/api/v1/comments/{created['id']}", json={"body": "not mine"}, headers=forum.other_headers
    )
    assert response.status_code == 403


def test_delete_soft_deletes_and_keeps_replies(client: TestClient, forum: SimpleNamespace) -> None:
    root = _post(client, forum.thread_id, forum.author_headers, "root").json()
    reply = _post(client, forum.thread_id, forum.other_headers, "reply", root["id"]).json()

    deleted = client.delete(f"/api/v1/comments/{root['id']}", headers=forum.author_headers)
    assert deleted.status_code == 204

    roots = client.get(f"/api/v1/threads/{forum.thread_id}/comments").json()["items"]
    assert len(roots) == 1
    assert roots[0]["id"] == root["id"]
    assert roots[0]["is_deleted"] is True
    assert roots[0]["body_html"] == "[gelöscht]"
    assert [child["id"] for child in roots[0]["replies"]] == [reply["id"]]
    assert roots[0]["replies"][0]["is_deleted"] is False

    row = forum.session.get(Comment, root["id"])
    forum.session.refresh(row)
    assert row is not None
    assert row.deleted_at is not None

    again = client.delete(f"/api/v1/comments/{root['id']}", headers=forum.author_headers)
    assert again.status_code == 204


def test_delete_of_another_users_comment_is_forbidden(
    client: TestClient, forum: SimpleNamespace
) -> None:
    created = _post(client, forum.thread_id, forum.author_headers, "mine").json()
    response = client.delete(f"/api/v1/comments/{created['id']}", headers=forum.other_headers)
    assert response.status_code == 403


def test_comment_count_is_tracked_on_the_thread(client: TestClient, forum: SimpleNamespace) -> None:
    root = _post(client, forum.thread_id, forum.author_headers, "root").json()
    _post(client, forum.thread_id, forum.other_headers, "reply", root["id"])

    thread = forum.session.get(Thread, forum.thread_id)
    forum.session.refresh(thread)
    assert thread.comment_count == 2

    client.delete(f"/api/v1/comments/{root['id']}", headers=forum.author_headers)
    forum.session.refresh(thread)
    assert thread.comment_count == 1


def test_reply_parent_must_belong_to_the_thread(client: TestClient, forum: SimpleNamespace) -> None:
    response = _post(client, forum.thread_id, forum.author_headers, "orphan", 999999)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_missing_thread_answers_404(client: TestClient, forum: SimpleNamespace) -> None:
    listing = client.get("/api/v1/threads/999999/comments")
    assert listing.status_code == 404
    created = _post(client, 999999, forum.author_headers, "nope")
    assert created.status_code == 404


def test_create_requires_authentication(client: TestClient, forum: SimpleNamespace) -> None:
    response = client.post(
        f"/api/v1/threads/{forum.thread_id}/comments", json={"body": "anonymous"}
    )
    assert response.status_code == 401
    assert set(response.json()["error"]) == {"code", "message", "details"}


def test_blank_body_is_rejected(client: TestClient, forum: SimpleNamespace) -> None:
    response = _post(client, forum.thread_id, forum.author_headers, "   ")
    assert response.status_code == 422
    details = response.json()["error"]["details"]
    assert any(item["field"] == "body" for item in details)


def test_page_beyond_last_is_empty(client: TestClient, forum: SimpleNamespace) -> None:
    _post(client, forum.thread_id, forum.author_headers, "only one")
    page = client.get(f"/api/v1/threads/{forum.thread_id}/comments?page=5").json()
    assert page["items"] == []
    assert page["total"] == 1
    assert page["page"] == 5


def test_creating_a_comment_enqueues_engagement_jobs(
    client: TestClient, forum: SimpleNamespace, db: Session
) -> None:
    _post(
        client,
        forum.thread_id,
        forum.author_headers,
        f"Hello @{forum.other.username}, please look.",
    )

    notification_jobs = list(db.scalars(select(Job)).all())
    replies = [
        job
        for job in notification_jobs
        if job.kind == NOTIFICATION_CREATE
        and job.payload.get("thread_id") == forum.thread_id
        and job.payload.get("user_id") == forum.other.id
    ]
    assert len(replies) == 1
    assert replies[0].payload["type"] == "mention"

    hot_jobs = [
        job
        for job in notification_jobs
        if job.kind == THREAD_HOT_SCORE and job.payload.get("thread_ids") == [forum.thread_id]
    ]
    assert len(hot_jobs) == 1
