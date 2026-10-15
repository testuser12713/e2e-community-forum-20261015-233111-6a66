"""Admin user management: search, roles, bans, self-protection and audit.

The suite runs against the real PostgreSQL database set up by ``conftest``. Every
user it needs is created here and removed again afterwards, so it touches only
rows it owns.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.deps import get_current_user, require_active_writer
from app.errors import install_handlers
from app.models import AuditLog, User
from app.security import create_access_token, hash_password

PASSWORD = "Correct-Horse-Battery-1!"


@pytest.fixture
def create_user() -> Iterator[Callable[..., User]]:
    """Create persisted users in their own session and remove them afterwards."""
    created_ids: list[int] = []

    def _create(
        *,
        username: str | None = None,
        email: str | None = None,
        role: str = "user",
        is_banned: bool = False,
        ban_reason: str | None = None,
        ban_expires_at: datetime | None = None,
    ) -> User:
        suffix = uuid.uuid4().hex[:10]
        db: Session = get_session_factory()()
        user = User(
            username=username or f"au_{suffix}",
            email=email or f"au_{suffix}@example.com",
            password_hash=hash_password(PASSWORD),
            display_name=f"Admin User {suffix}",
            role=role,
            is_banned=is_banned,
            ban_reason=ban_reason,
            ban_expires_at=ban_expires_at,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_ids.append(user.id)
        db.close()
        return user

    yield _create

    if not created_ids:
        return
    db = get_session_factory()()
    db.execute(
        delete(AuditLog).where(
            AuditLog.target_type == "user",
            AuditLog.target_id.in_(created_ids),
        )
    )
    db.execute(delete(User).where(User.id.in_(created_ids)))
    db.commit()
    db.close()


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _probe_app() -> FastAPI:
    """A tiny app exposing the read and write dependencies for ban testing."""
    probe = FastAPI()
    install_handlers(probe)

    @probe.get("/read")
    def read(user: User = Depends(get_current_user)) -> dict[str, int]:
        return {"id": user.id}

    @probe.get("/write")
    def write(user: User = Depends(require_active_writer)) -> dict[str, bool]:
        return {"ok": True}

    return probe


def test_admin_endpoint_requires_admin(client: TestClient, create_user) -> None:
    user = create_user(role="user")
    moderator = create_user(role="moderator")

    assert client.get("/api/v1/admin/users").status_code == 401
    assert client.get("/api/v1/admin/users", headers=_auth(user)).status_code == 403
    assert client.get("/api/v1/admin/users", headers=_auth(moderator)).status_code == 403


def test_search_finds_a_user_by_username_and_email(client: TestClient, create_user) -> None:
    admin = create_user(role="admin")
    unique = uuid.uuid4().hex[:8]
    target = create_user(
        username=f"finder_{unique}",
        email=f"mailer_{unique}@example.com",
    )
    headers = _auth(admin)

    by_name = client.get("/api/v1/admin/users", params={"q": f"finder_{unique}"}, headers=headers)
    assert by_name.status_code == 200
    name_body = by_name.json()
    assert name_body["total"] == 1
    assert name_body["items"][0]["id"] == target.id
    assert set(name_body) == {"items", "page", "per_page", "total", "pages"}

    by_email = client.get("/api/v1/admin/users", params={"q": f"mailer_{unique}"}, headers=headers)
    assert by_email.status_code == 200
    assert by_email.json()["items"][0]["id"] == target.id


def test_user_list_pages_and_a_page_past_the_end_is_empty(client: TestClient, create_user) -> None:
    admin = create_user(role="admin")
    prefix = uuid.uuid4().hex[:8]
    for index in range(3):
        create_user(
            username=f"page_{prefix}_{index}",
            email=f"page_{prefix}_{index}@example.com",
        )
    headers = _auth(admin)
    query = {"q": f"page_{prefix}", "per_page": 2}

    first = client.get("/api/v1/admin/users", params=query, headers=headers).json()
    assert first["total"] == 3
    assert first["pages"] == 2
    assert len(first["items"]) == 2

    second = client.get("/api/v1/admin/users", params={**query, "page": 2}, headers=headers).json()
    assert len(second["items"]) == 1

    beyond = client.get("/api/v1/admin/users", params={**query, "page": 99}, headers=headers)
    assert beyond.status_code == 200
    assert beyond.json()["items"] == []


def test_role_change_applies_to_the_next_request_without_new_login(
    client: TestClient, create_user
) -> None:
    admin = create_user(role="admin")
    target = create_user(role="user")
    target_headers = _auth(target)

    assert client.get("/api/v1/admin/users", headers=target_headers).status_code == 403

    response = client.patch(
        f"/api/v1/admin/users/{target.id}/role",
        json={"role": "admin"},
        headers=_auth(admin),
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"

    # The very same token now authenticates against the new role.
    assert client.get("/api/v1/admin/users", headers=target_headers).status_code == 200


def test_self_role_change_and_self_ban_answer_400(client: TestClient, create_user) -> None:
    admin = create_user(role="admin")
    headers = _auth(admin)

    role_response = client.patch(
        f"/api/v1/admin/users/{admin.id}/role",
        json={"role": "user"},
        headers=headers,
    )
    assert role_response.status_code == 400
    assert role_response.json()["error"]["code"] == "bad_request"

    ban_response = client.post(
        f"/api/v1/admin/users/{admin.id}/ban",
        json={"reason": "self"},
        headers=headers,
    )
    assert ban_response.status_code == 400
    assert ban_response.json()["error"]["code"] == "bad_request"


def test_ban_with_reason_and_expiry_is_visible_and_unban_clears_it(
    client: TestClient, create_user
) -> None:
    admin = create_user(role="admin")
    target = create_user(role="user")
    headers = _auth(admin)
    expiry = (datetime.now(UTC) + timedelta(days=3)).replace(microsecond=0)

    banned = client.post(
        f"/api/v1/admin/users/{target.id}/ban",
        json={"reason": "Spam", "expires_at": expiry.isoformat()},
        headers=headers,
    )
    assert banned.status_code == 200
    body = banned.json()
    assert body["is_banned"] is True
    assert body["ban_reason"] == "Spam"
    assert body["ban_expires_at"] is not None

    listed = client.get(
        "/api/v1/admin/users", params={"q": target.username}, headers=headers
    ).json()
    assert listed["items"][0]["is_banned"] is True
    assert listed["items"][0]["ban_reason"] == "Spam"

    unbanned = client.delete(f"/api/v1/admin/users/{target.id}/ban", headers=headers)
    assert unbanned.status_code == 200
    assert unbanned.json()["is_banned"] is False
    assert unbanned.json()["ban_reason"] is None
    assert unbanned.json()["ban_expires_at"] is None


def test_invalid_role_answers_422_in_the_envelope(client: TestClient, create_user) -> None:
    admin = create_user(role="admin")
    target = create_user(role="user")

    response = client.patch(
        f"/api/v1/admin/users/{target.id}/role",
        json={"role": "superuser"},
        headers=_auth(admin),
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert isinstance(body["error"]["details"], list)


def test_unknown_user_answers_404(client: TestClient, create_user) -> None:
    admin = create_user(role="admin")
    response = client.patch(
        "/api/v1/admin/users/2147483600/role",
        json={"role": "user"},
        headers=_auth(admin),
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_every_action_writes_an_audit_entry(client: TestClient, create_user) -> None:
    admin = create_user(role="admin")
    target = create_user(role="user")
    headers = _auth(admin)

    client.patch(
        f"/api/v1/admin/users/{target.id}/role",
        json={"role": "moderator"},
        headers=headers,
    )
    client.post(
        f"/api/v1/admin/users/{target.id}/ban",
        json={"reason": "Spam"},
        headers=headers,
    )
    client.delete(f"/api/v1/admin/users/{target.id}/ban", headers=headers)

    db = get_session_factory()()
    actions = (
        db.execute(
            select(AuditLog.action).where(
                AuditLog.target_type == "user",
                AuditLog.target_id == target.id,
                AuditLog.actor_id == admin.id,
            )
        )
        .scalars()
        .all()
    )
    db.close()

    assert {"user.role_change", "user.ban", "user.unban"} <= set(actions)


def test_banned_user_reads_but_cannot_write(create_user) -> None:
    banned = create_user(
        is_banned=True,
        ban_reason="Spam",
        ban_expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    headers = _auth(banned)

    with TestClient(_probe_app()) as probe:
        assert probe.get("/read", headers=headers).status_code == 200

        response = probe.get("/write", headers=headers)
        assert response.status_code == 403
        error = response.json()["error"]
        assert error["code"] == "user_banned"
        assert error["details"]["reason"] == "Spam"
        assert error["details"]["expires_at"] is not None


def test_active_user_can_write(create_user) -> None:
    active = create_user(role="user")
    with TestClient(_probe_app()) as probe:
        assert probe.get("/write", headers=_auth(active)).status_code == 200
