"""Admin audit-log API: AC-08 (403 for non-admins) and AC-28 (readable log).

The suite runs against PostgreSQL. Each audit entry is produced through the
shared ``write_audit`` service — the write side every moderation and admin
ticket calls — and then read back through the endpoint, so these tests prove the
read contract without depending on another ticket's router.
"""

from __future__ import annotations

import secrets
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.db import get_session_factory
from app.models import AuditLog, User
from app.security import create_access_token, hash_password
from app.services.audit import write_audit

_PASSWORD = "Correct-Horse-Battery-1!"
_PASSWORD_HASH = hash_password(_PASSWORD)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_user(session: Any, *, prefix: str, suffix: str, role: str) -> User:
    username = f"{prefix}_{suffix}"
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=_PASSWORD_HASH,
        display_name=prefix.title(),
        role=role,
    )
    session.add(user)
    session.flush()
    return user


@pytest.fixture
def audit_data(client: TestClient) -> Iterator[dict[str, Any]]:
    """Two users and three audit entries, removed again afterwards."""
    session = get_session_factory()()
    suffix = secrets.token_hex(4)
    admin = _make_user(session, prefix="admin", suffix=suffix, role="admin")
    member = _make_user(session, prefix="member", suffix=suffix, role="user")

    now = datetime.now(UTC)
    older = write_audit(
        session,
        actor_id=admin.id,
        action="thread.pin",
        target_type="thread",
        target_id=101,
        metadata={"reason": "hot"},
    )
    older.created_at = now - timedelta(minutes=2)
    newer = write_audit(
        session,
        actor_id=admin.id,
        action="user.ban",
        target_type="user",
        target_id=member.id,
        metadata={"reason": "spam"},
    )
    newer.created_at = now - timedelta(minutes=1)
    newest = write_audit(
        session,
        actor_id=member.id,
        action="report.resolve",
        target_type="report",
        target_id=7,
    )
    newest.created_at = now
    session.commit()

    user_ids = [admin.id, member.id]
    entry_ids = [older.id, newer.id, newest.id]
    yield {
        "admin_token": create_access_token(admin.id, admin.role),
        "member_token": create_access_token(member.id, member.role),
        "admin_id": admin.id,
        "member_id": member.id,
        "entry_ids": entry_ids,
    }

    session.execute(delete(AuditLog).where(AuditLog.id.in_(entry_ids)))
    session.execute(delete(User).where(User.id.in_(user_ids)))
    session.commit()
    session.close()


def test_actions_appear_with_actor_action_target_and_timestamp(
    client: TestClient, audit_data: dict[str, Any]
) -> None:
    response = client.get("/api/v1/admin/audit-logs", headers=_auth(audit_data["admin_token"]))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "total", "pages"}

    by_id = {item["id"]: item for item in body["items"]}
    assert set(audit_data["entry_ids"]).issubset(by_id)

    pin = by_id[audit_data["entry_ids"][0]]
    assert pin["action"] == "thread.pin"
    assert pin["target_type"] == "thread"
    assert pin["target_id"] == 101
    assert pin["actor"]["id"] == audit_data["admin_id"]
    assert pin["actor"]["username"].startswith("admin_")
    assert pin["metadata"] == {"reason": "hot"}
    assert pin["created_at"]


def test_entries_are_newest_first(client: TestClient, audit_data: dict[str, Any]) -> None:
    response = client.get("/api/v1/admin/audit-logs", headers=_auth(audit_data["admin_token"]))
    assert response.status_code == 200
    items = response.json()["items"]

    timestamps = [item["created_at"] for item in items]
    assert timestamps == sorted(timestamps, reverse=True)

    mine = [item["id"] for item in items if item["id"] in audit_data["entry_ids"]]
    assert mine == list(reversed(audit_data["entry_ids"]))


def test_filtering_by_action_narrows_the_result(
    client: TestClient, audit_data: dict[str, Any]
) -> None:
    response = client.get(
        "/api/v1/admin/audit-logs?action=user.ban",
        headers=_auth(audit_data["admin_token"]),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert all(item["action"] == "user.ban" for item in items)
    assert {item["id"] for item in items} == {audit_data["entry_ids"][1]}


def test_filtering_by_actor(client: TestClient, audit_data: dict[str, Any]) -> None:
    response = client.get(
        f"/api/v1/admin/audit-logs?actor_id={audit_data['member_id']}",
        headers=_auth(audit_data["admin_token"]),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert all(item["actor"]["id"] == audit_data["member_id"] for item in items)
    assert {item["id"] for item in items} == {audit_data["entry_ids"][2]}


def test_filtering_by_target_type(client: TestClient, audit_data: dict[str, Any]) -> None:
    response = client.get(
        "/api/v1/admin/audit-logs?target_type=user",
        headers=_auth(audit_data["admin_token"]),
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert all(item["target_type"] == "user" for item in items)
    assert audit_data["entry_ids"][1] in {item["id"] for item in items}


def test_pagination_envelope_and_page_beyond_last(
    client: TestClient, audit_data: dict[str, Any]
) -> None:
    response = client.get(
        "/api/v1/admin/audit-logs?page=1&per_page=1",
        headers=_auth(audit_data["admin_token"]),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert len(body["items"]) == 1
    assert body["pages"] == body["total"]

    beyond = client.get(
        "/api/v1/admin/audit-logs?page=99999&per_page=1",
        headers=_auth(audit_data["admin_token"]),
    )
    assert beyond.status_code == 200
    assert beyond.json()["items"] == []


def test_non_admin_answers_403(client: TestClient, audit_data: dict[str, Any]) -> None:
    response = client.get("/api/v1/admin/audit-logs", headers=_auth(audit_data["member_token"]))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_unauthenticated_answers_401(client: TestClient) -> None:
    response = client.get("/api/v1/admin/audit-logs")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_invalid_target_type_answers_422_envelope(
    client: TestClient, audit_data: dict[str, Any]
) -> None:
    response = client.get(
        "/api/v1/admin/audit-logs?target_type=spaceship",
        headers=_auth(audit_data["admin_token"]),
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details"}
    assert isinstance(error["details"], list)
