"""Refresh rotation, logout and password change acceptance (ticket #17).

Runs against the real PostgreSQL database prepared by the conftest session
fixture. Every test creates its own uniquely named user and removes only the
``user`` rows it made (refresh tokens cascade with them), so no data outlives
the test and no table another ticket owns is reset.
"""

from __future__ import annotations

import re
import secrets
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.db import get_session_factory
from app.models import RefreshToken, User
from app.security import hash_refresh_token

_PREFIX = "sess" + secrets.token_hex(4)
_STRONG_PASSWORD = "Correct-Horse-Battery-1!"
_NEW_PASSWORD = "Another-Good-Password-2!"
_REGISTER = "/api/v1/auth/register"
_LOGIN = "/api/v1/auth/login"
_REFRESH = "/api/v1/auth/refresh"
_LOGOUT = "/api/v1/auth/logout"
_CHANGE_PASSWORD = "/api/v1/auth/change-password"


def _username(tag: str = "") -> str:
    return f"{_PREFIX}{tag}{secrets.token_hex(3)}"


def _email(name: str) -> str:
    return f"{name}@example.test"


def _register(client: TestClient, username: str, password: str = _STRONG_PASSWORD) -> object:
    return client.post(
        _REGISTER,
        json={"username": username, "email": _email(username), "password": password},
    )


def _login(client: TestClient, identifier: str, password: str) -> object:
    return client.post(
        _LOGIN,
        json={"username_or_email": identifier, "password": password},
    )


def _cookie_from(response: object) -> str:
    header = response.headers["set-cookie"]  # type: ignore[attr-defined]
    match = re.search(r"refresh_token=([^;]+)", header)
    assert match is not None
    value = match.group(1)
    assert value
    return value


def _tokens_for(username: str) -> list[RefreshToken]:
    session = get_session_factory()()
    try:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        return list(
            session.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)).scalars()
        )
    finally:
        session.close()


def _password_hash(username: str) -> str:
    session = get_session_factory()()
    try:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        return user.password_hash
    finally:
        session.close()


def _cookie_cleared(response: object) -> bool:
    header = response.headers.get("set-cookie", "")  # type: ignore[attr-defined]
    lowered = header.lower()
    return "refresh_token=" in lowered and "max-age=0" in lowered


@pytest.fixture(autouse=True)
def _cleanup() -> Iterator[None]:
    yield
    session = get_session_factory()()
    try:
        session.execute(delete(User).where(User.username.like(f"{_PREFIX}%")))
        session.commit()
    finally:
        session.close()


def test_refresh_rotates_cookie_and_invalidates_previous(client: TestClient) -> None:
    username = _username()
    assert _register(client, username).status_code == 201
    login = _login(client, username, _STRONG_PASSWORD)
    original_cookie = _cookie_from(login)

    response = client.post(_REFRESH)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    assert body["access_token"]
    rotated_cookie = _cookie_from(response)
    assert rotated_cookie != original_cookie

    tokens = {token.token_hash: token for token in _tokens_for(username)}
    old_token = tokens[hash_refresh_token(original_cookie)]
    new_token = tokens[hash_refresh_token(rotated_cookie)]
    assert old_token.revoked is True
    assert new_token.revoked is False
    assert old_token.family_id == new_token.family_id

    assert client.post(_REFRESH).status_code == 200


def test_replaying_rotated_token_answers_401_and_revokes_family(client: TestClient) -> None:
    username = _username()
    assert _register(client, username).status_code == 201
    login = _login(client, username, _STRONG_PASSWORD)
    original_cookie = _cookie_from(login)
    first_refresh = client.post(_REFRESH)
    rotated_cookie = _cookie_from(first_refresh)

    client.cookies.set("refresh_token", original_cookie, path="/api/v1/auth")
    replay = client.post(_REFRESH)

    assert replay.status_code == 401
    body = replay.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "unauthorized"

    tokens = _tokens_for(username)
    assert tokens
    assert all(token.revoked is True for token in tokens)

    client.cookies.set("refresh_token", rotated_cookie, path="/api/v1/auth")
    assert client.post(_REFRESH).status_code == 401


def test_logout_clears_cookie_and_token_is_rejected(client: TestClient) -> None:
    username = _username()
    assert _register(client, username).status_code == 201
    login = _login(client, username, _STRONG_PASSWORD)
    used_cookie = _cookie_from(login)

    response = client.post(_LOGOUT)

    assert response.status_code == 204
    assert _cookie_cleared(response)

    tokens = _tokens_for(username)
    token = next(t for t in tokens if t.token_hash == hash_refresh_token(used_cookie))
    assert token.revoked is True

    client.cookies.set("refresh_token", used_cookie, path="/api/v1/auth")
    assert client.post(_REFRESH).status_code == 401


def test_wrong_current_password_answers_400_and_keeps_hash(client: TestClient) -> None:
    username = _username()
    assert _register(client, username).status_code == 201
    login = _login(client, username, _STRONG_PASSWORD)
    access_token = login.json()["access_token"]
    before = _password_hash(username)

    response = client.post(
        _CHANGE_PASSWORD,
        json={"current_password": "Wrong-Password-1!", "new_password": _NEW_PASSWORD},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 400
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    details = body["error"]["details"]
    assert isinstance(details, list)
    assert {entry["field"] for entry in details} == {"current_password"}
    assert all(entry["message"] for entry in details)
    assert _password_hash(username) == before


def test_change_password_revokes_all_other_refresh_tokens(client: TestClient) -> None:
    username = _username()
    assert _register(client, username).status_code == 201
    first_login = _login(client, username, _STRONG_PASSWORD)
    first_cookie = _cookie_from(first_login)
    second_login = _login(client, username, _STRONG_PASSWORD)
    second_cookie = _cookie_from(second_login)
    access_token = second_login.json()["access_token"]

    response = client.post(
        _CHANGE_PASSWORD,
        json={"current_password": _STRONG_PASSWORD, "new_password": _NEW_PASSWORD},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 204

    tokens = {token.token_hash: token for token in _tokens_for(username)}
    assert tokens[hash_refresh_token(first_cookie)].revoked is True
    assert tokens[hash_refresh_token(second_cookie)].revoked is False

    assert _login(client, username, _STRONG_PASSWORD).status_code == 401
    assert _login(client, username, _NEW_PASSWORD).status_code == 200


def test_change_password_without_auth_answers_401(client: TestClient) -> None:
    response = client.post(
        _CHANGE_PASSWORD,
        json={"current_password": _STRONG_PASSWORD, "new_password": _NEW_PASSWORD},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_change_password_weak_new_password_answers_422(client: TestClient) -> None:
    username = _username()
    assert _register(client, username).status_code == 201
    login = _login(client, username, _STRONG_PASSWORD)
    access_token = login.json()["access_token"]

    response = client.post(
        _CHANGE_PASSWORD,
        json={"current_password": _STRONG_PASSWORD, "new_password": "weak"},
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    fields = {entry["field"] for entry in body["error"]["details"]}
    assert "new_password" in fields
