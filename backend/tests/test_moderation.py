"""Moderation acceptance: thread actions, the report queue and audit entries.

Runs against the real PostgreSQL database (the schema is created by the
session fixture in ``conftest.py``). Every test provisions its own users,
categories, threads and reports with unique names and removes exactly those
rows afterwards, so it never depends on — or disturbs — another ticket's data.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import AuditLog, Category, Report, Thread, User
from app.security import create_access_token, hash_password


def _new_session() -> Session:
    return get_session_factory()()


def _unique(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _make_user(session: Session, role: str = "user") -> User:
    name = _unique("modtest")
    user = User(
        username=name,
        email=f"{name}@example.test",
        password_hash=hash_password("Password-123!"),
        display_name=name,
        role=role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_category(session: Session) -> Category:
    name = _unique("cat")
    category = Category(name=name, slug=name)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def _make_thread(session: Session, author: User, category: Category) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="A moderation target",
        body_markdown="Some body text.",
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return thread


def _make_report(session: Session, reporter: User, content_type: str, content_id: int) -> Report:
    report = Report(
        content_type=content_type,
        content_id=content_id,
        reason="spam",
        note=None,
        reporter_id=reporter.id,
        status="open",
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world() -> Iterator[dict[str, Any]]:
    """Track created rows and delete exactly them after the test."""
    state: dict[str, Any] = {"users": [], "categories": [], "threads": [], "reports": []}
    yield state

    session = _new_session()
    try:
        if state["reports"]:
            session.execute(
                delete(AuditLog).where(
                    AuditLog.target_type == "report",
                    AuditLog.target_id.in_(state["reports"]),
                )
            )
            session.execute(delete(Report).where(Report.id.in_(state["reports"])))
        if state["threads"]:
            session.execute(
                delete(AuditLog).where(
                    AuditLog.target_type == "thread",
                    AuditLog.target_id.in_(state["threads"]),
                )
            )
            session.execute(delete(Thread).where(Thread.id.in_(state["threads"])))
        if state["categories"]:
            session.execute(delete(Category).where(Category.id.in_(state["categories"])))
        if state["users"]:
            session.execute(delete(AuditLog).where(AuditLog.actor_id.in_(state["users"])))
            session.execute(delete(User).where(User.id.in_(state["users"])))
        session.commit()
    finally:
        session.close()


@pytest.fixture
def seed(world: dict[str, Any]) -> dict[str, Any]:
    """A moderator, a plain user, two categories and a thread."""
    session = _new_session()
    try:
        moderator = _make_user(session, "moderator")
        plain = _make_user(session, "user")
        category_a = _make_category(session)
        category_b = _make_category(session)
        thread = _make_thread(session, plain, category_a)
        world["users"] += [moderator.id, plain.id]
        world["categories"] += [category_a.id, category_b.id]
        world["threads"].append(thread.id)
        return {
            "moderator": moderator,
            "plain": plain,
            "category_a": category_a,
            "category_b": category_b,
            "thread": thread,
        }
    finally:
        session.close()


def _audit_rows(actor_id: int, target_type: str, target_id: int) -> list[AuditLog]:
    session = _new_session()
    try:
        return list(
            session.execute(
                select(AuditLog).where(
                    AuditLog.actor_id == actor_id,
                    AuditLog.target_type == target_type,
                    AuditLog.target_id == target_id,
                )
            )
            .scalars()
            .all()
        )
    finally:
        session.close()


def _fresh_thread(thread_id: int) -> Thread | None:
    session = _new_session()
    try:
        return session.get(Thread, thread_id)
    finally:
        session.close()


def test_moderate_pin(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    response = client.post(
        f"/api/v1/threads/{thread.id}/moderate",
        json={"action": "pin"},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 200
    assert response.json()["is_pinned"] is True
    assert _fresh_thread(thread.id).is_pinned is True


def test_moderate_lock_and_unlock(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    headers = _auth(seed["moderator"])

    locked = client.post(
        f"/api/v1/threads/{thread.id}/moderate", json={"action": "lock"}, headers=headers
    )
    assert locked.status_code == 200
    assert locked.json()["is_locked"] is True
    assert _fresh_thread(thread.id).is_locked is True

    unlocked = client.post(
        f"/api/v1/threads/{thread.id}/moderate", json={"action": "unlock"}, headers=headers
    )
    assert unlocked.status_code == 200
    assert unlocked.json()["is_locked"] is False


def test_moderate_move_to_category(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    target = seed["category_b"]
    response = client.post(
        f"/api/v1/threads/{thread.id}/moderate",
        json={"action": "move", "category_id": target.id},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 200
    assert response.json()["category"]["id"] == target.id
    assert _fresh_thread(thread.id).category_id == target.id


def test_moderate_remove_soft_deletes(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    response = client.post(
        f"/api/v1/threads/{thread.id}/moderate",
        json={"action": "remove"},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 200
    assert response.json()["is_deleted"] is True
    stored = _fresh_thread(thread.id)
    assert stored.is_deleted is True
    assert stored.deleted_at is not None


def test_moderate_move_without_category_is_422(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    response = client.post(
        f"/api/v1/threads/{thread.id}/moderate",
        json={"action": "move"},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}


def test_moderate_move_to_unknown_category_is_404(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    response = client.post(
        f"/api/v1/threads/{thread.id}/moderate",
        json={"action": "move", "category_id": 2_000_000_000},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 404


def test_moderate_unknown_thread_is_404(client: TestClient, seed: dict[str, Any]) -> None:
    response = client.post(
        "/api/v1/threads/2000000000/moderate",
        json={"action": "pin"},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 404


def test_each_moderation_action_writes_an_audit_entry(
    client: TestClient, seed: dict[str, Any]
) -> None:
    thread = seed["thread"]
    moderator = seed["moderator"]
    headers = _auth(moderator)

    for action in ("pin", "unpin", "lock", "unlock", "remove"):
        response = client.post(
            f"/api/v1/threads/{thread.id}/moderate", json={"action": action}, headers=headers
        )
        assert response.status_code == 200

    entries = _audit_rows(moderator.id, "thread", thread.id)
    actions = sorted(entry.action for entry in entries)
    assert actions == [
        "thread.lock",
        "thread.pin",
        "thread.remove",
        "thread.unlock",
        "thread.unpin",
    ]
    assert all(entry.actor_id == moderator.id for entry in entries)


def test_plain_user_is_forbidden_on_every_moderation_route(
    client: TestClient, world: dict[str, Any], seed: dict[str, Any]
) -> None:
    thread = seed["thread"]
    headers = _auth(seed["plain"])

    moderate = client.post(
        f"/api/v1/threads/{thread.id}/moderate", json={"action": "pin"}, headers=headers
    )
    assert moderate.status_code == 403
    assert moderate.json()["error"]["code"] == "forbidden"

    queue = client.get("/api/v1/moderation/reports", headers=headers)
    assert queue.status_code == 403

    session = _new_session()
    try:
        report = _make_report(session, seed["plain"], "thread", thread.id)
        report_id = report.id
        world["reports"].append(report_id)
    finally:
        session.close()

    resolve = client.post(
        f"/api/v1/moderation/reports/{report_id}/resolve",
        json={"action": "dismiss"},
        headers=headers,
    )
    assert resolve.status_code == 403


def test_moderation_routes_require_authentication(client: TestClient, seed: dict[str, Any]) -> None:
    thread = seed["thread"]
    assert (
        client.post(f"/api/v1/threads/{thread.id}/moderate", json={"action": "pin"}).status_code
        == 401
    )
    assert client.get("/api/v1/moderation/reports").status_code == 401


def test_resolved_report_leaves_open_queue_and_is_audited(
    client: TestClient, world: dict[str, Any], seed: dict[str, Any]
) -> None:
    thread = seed["thread"]
    reporter = seed["plain"]
    moderator = seed["moderator"]

    session = _new_session()
    try:
        report = _make_report(session, reporter, "thread", thread.id)
        report_id = report.id
        world["reports"].append(report_id)
    finally:
        session.close()

    response = client.post(
        f"/api/v1/moderation/reports/{report_id}/resolve",
        json={"action": "remove_content"},
        headers=_auth(moderator),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "resolved"

    stored = _fresh_thread(thread.id)
    assert stored.is_deleted is True

    open_queue = client.get(
        "/api/v1/moderation/reports",
        params={"status": "open", "per_page": 100},
        headers=_auth(moderator),
    )
    assert open_queue.status_code == 200
    assert open_queue.json()["items"] is not None
    assert all(item["id"] != report_id for item in open_queue.json()["items"])

    entries = _audit_rows(moderator.id, "report", report_id)
    assert [entry.action for entry in entries] == ["report.remove_content"]


def test_dismissed_report_keeps_content(
    client: TestClient, world: dict[str, Any], seed: dict[str, Any]
) -> None:
    thread = seed["thread"]
    moderator = seed["moderator"]

    session = _new_session()
    try:
        report = _make_report(session, seed["plain"], "thread", thread.id)
        report_id = report.id
        world["reports"].append(report_id)
    finally:
        session.close()

    response = client.post(
        f"/api/v1/moderation/reports/{report_id}/resolve",
        json={"action": "dismiss"},
        headers=_auth(moderator),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "dismissed"
    assert _fresh_thread(thread.id).is_deleted is False

    entries = _audit_rows(moderator.id, "report", report_id)
    assert [entry.action for entry in entries] == ["report.dismiss"]


def test_resolve_unknown_report_is_404(client: TestClient, seed: dict[str, Any]) -> None:
    response = client.post(
        "/api/v1/moderation/reports/2000000000/resolve",
        json={"action": "dismiss"},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 404


def test_reports_queue_page_envelope(
    client: TestClient, world: dict[str, Any], seed: dict[str, Any]
) -> None:
    thread = seed["thread"]
    session = _new_session()
    try:
        for status, content_id in (("open", thread.id), ("resolved", thread.id)):
            report = _make_report(session, seed["plain"], "thread", content_id)
            report.status = status
            session.commit()
            world["reports"].append(report.id)
    finally:
        session.close()

    response = client.get(
        "/api/v1/moderation/reports",
        params={"page": 1, "per_page": 1},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "total", "pages"}
    assert body["page"] == 1
    assert body["per_page"] == 1

    status_filtered = client.get(
        "/api/v1/moderation/reports",
        params={"status": "resolved", "per_page": 100},
        headers=_auth(seed["moderator"]),
    )
    assert status_filtered.status_code == 200
    assert all(item["status"] == "resolved" for item in status_filtered.json()["items"])

    last = client.get(
        "/api/v1/moderation/reports",
        params={"page": 999999, "per_page": 100},
        headers=_auth(seed["moderator"]),
    )
    assert last.status_code == 200
    assert last.json()["items"] == []


def test_reports_queue_rejects_invalid_status(client: TestClient, seed: dict[str, Any]) -> None:
    response = client.get(
        "/api/v1/moderation/reports",
        params={"status": "bogus"},
        headers=_auth(seed["moderator"]),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
