"""Vote behaviour against real PostgreSQL: switching, removing, score, karma.

These tests provision their own users, category, thread and comment (unique per
test), exercise the vote routes through the app, and verify the returned score
and karma against the sum of the vote rows — the source of truth (AC-16/AC-17).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Thread, User, Vote
from app.security import create_access_token, hash_password


@pytest.fixture
def db() -> Iterator[Session]:
    """A direct session for provisioning and verifying test rows."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def forum(db: Session) -> Iterator[SimpleNamespace]:
    """Provision an author with a thread and a comment plus two other voters."""
    token = uuid.uuid4().hex[:10]

    def make_user(role: str) -> User:
        return User(
            username=f"u-{role}-{token}",
            email=f"u-{role}-{token}@example.com",
            password_hash=hash_password("Correct-Horse-Battery-1!"),
            display_name=role.title(),
            role="user",
        )

    category = Category(name=f"cat-{token}", slug=f"cat-{token}", position=0)
    author = make_user("author")
    voter = make_user("voter")
    other = make_user("other")
    db.add_all([category, author, voter, other])
    db.flush()

    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="A thread",
        body_markdown="Body",
    )
    db.add(thread)
    db.flush()

    comment = Comment(
        thread_id=thread.id,
        author_id=author.id,
        depth=1,
        body_markdown="A comment",
    )
    db.add(comment)
    db.flush()
    db.commit()

    namespace = SimpleNamespace(
        category_id=category.id,
        author_id=author.id,
        voter_id=voter.id,
        other_id=other.id,
        thread_id=thread.id,
        comment_id=comment.id,
        author_token=create_access_token(author.id, "user"),
        voter_token=create_access_token(voter.id, "user"),
        other_token=create_access_token(other.id, "user"),
    )
    yield namespace

    db.delete(comment)
    db.delete(thread)
    db.flush()
    db.delete(voter)
    db.delete(other)
    db.delete(author)
    db.delete(category)
    db.commit()


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _content_score(
    db: Session, *, thread_id: int | None = None, comment_id: int | None = None
) -> int:
    stmt = select(func.coalesce(func.sum(Vote.value), 0))
    if thread_id is not None:
        stmt = stmt.where(Vote.thread_id == thread_id)
    else:
        stmt = stmt.where(Vote.comment_id == comment_id)
    return int(db.scalar(stmt))


def _author_karma(
    db: Session, *, thread_id: int | None = None, comment_id: int | None = None
) -> int:
    """Sum of every vote cast on the content's author (thread or comment)."""
    if thread_id is not None:
        author_id = db.scalar(select(Thread.author_id).where(Thread.id == thread_id))
    else:
        author_id = db.scalar(select(Comment.author_id).where(Comment.id == comment_id))
    thread_votes = select(func.coalesce(func.sum(Vote.value), 0)).where(
        Vote.thread_id.in_(select(Thread.id).where(Thread.author_id == author_id))
    )
    comment_votes = select(func.coalesce(func.sum(Vote.value), 0)).where(
        Vote.comment_id.in_(select(Comment.id).where(Comment.author_id == author_id))
    )
    return int(db.scalar(thread_votes)) + int(db.scalar(comment_votes))


def test_up_then_down_switches_vote(client: TestClient, forum: SimpleNamespace) -> None:
    up = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    assert up.status_code == 200
    assert up.json() == {"score": 1, "karma": 1, "my_vote": 1}

    down = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": -1},
        headers=_headers(forum.voter_token),
    )
    assert down.status_code == 200
    assert down.json() == {"score": -1, "karma": -1, "my_vote": -1}


def test_same_value_again_removes_vote(client: TestClient, forum: SimpleNamespace) -> None:
    first = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    assert first.json()["my_vote"] == 1

    second = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    assert second.status_code == 200
    assert second.json() == {"score": 0, "karma": 0, "my_vote": 0}


def test_comment_vote_switches(client: TestClient, forum: SimpleNamespace) -> None:
    up = client.post(
        f"/api/v1/comments/{forum.comment_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    assert up.json() == {"score": 1, "karma": 1, "my_vote": 1}

    down = client.post(
        f"/api/v1/comments/{forum.comment_id}/vote",
        json={"value": -1},
        headers=_headers(forum.voter_token),
    )
    assert down.json() == {"score": -1, "karma": -1, "my_vote": -1}


def test_score_and_karma_equal_vote_sums(
    client: TestClient, db: Session, forum: SimpleNamespace
) -> None:
    client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    second = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.other_token),
    )
    assert second.json()["score"] == 2

    client.post(
        f"/api/v1/comments/{forum.comment_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    after = client.post(
        f"/api/v1/comments/{forum.comment_id}/vote",
        json={"value": -1},
        headers=_headers(forum.other_token),
    )

    thread_sum = _content_score(db, thread_id=forum.thread_id)
    comment_sum = _content_score(db, comment_id=forum.comment_id)
    author_karma = _author_karma(db, thread_id=forum.thread_id)

    assert after.status_code == 200
    assert after.json()["score"] == comment_sum
    assert after.json()["karma"] == author_karma
    assert author_karma == thread_sum + comment_sum

    refreshed = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    assert refreshed.json()["score"] == _content_score(db, thread_id=forum.thread_id)
    assert refreshed.json()["karma"] == _author_karma(db, thread_id=forum.thread_id)


def test_vote_on_own_thread_answers_400(client: TestClient, forum: SimpleNamespace) -> None:
    response = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 1},
        headers=_headers(forum.author_token),
    )
    assert response.status_code == 400
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}


def test_vote_on_own_comment_answers_400(client: TestClient, forum: SimpleNamespace) -> None:
    response = client.post(
        f"/api/v1/comments/{forum.comment_id}/vote",
        json={"value": -1},
        headers=_headers(forum.author_token),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "own_content"


def test_vote_requires_authentication(client: TestClient, forum: SimpleNamespace) -> None:
    response = client.post(f"/api/v1/threads/{forum.thread_id}/vote", json={"value": 1})
    assert response.status_code == 401
    assert set(response.json()) == {"error"}


def test_vote_on_missing_content_answers_404(client: TestClient, forum: SimpleNamespace) -> None:
    response = client.post(
        "/api/v1/threads/99999999/vote",
        json={"value": 1},
        headers=_headers(forum.voter_token),
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_invalid_value_answers_422(client: TestClient, forum: SimpleNamespace) -> None:
    response = client.post(
        f"/api/v1/threads/{forum.thread_id}/vote",
        json={"value": 0},
        headers=_headers(forum.voter_token),
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["details"][0]["field"] == "value"
