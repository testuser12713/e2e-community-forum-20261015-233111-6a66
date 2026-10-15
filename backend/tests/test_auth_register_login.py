"""Registration and login acceptance (ticket: #39).

Runs against the real PostgreSQL database prepared by the conftest session
fixture. Every test creates its own uniquely named rows and removes only the
``user`` rows it made (the refresh tokens cascade with them).
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
from app.security import decode_access_token, hash_refresh_token

_PREFIX = "tst" + secrets.token_hex(4)
_STRONG_PASSWORD = "Correct-Horse-Battery-1!"
_REGISTER = "/api/v1/auth/register"
_LOGIN = "/api/v1/auth/login"


def _username(tag: str = "") -> str:
    return f"{_PREFIX}{tag}{secrets.token_hex(3)}"


def _email(name: str) -> str:
    return f"{name}@example.test"


def _register(client: TestClient, username: str, email: str, password: str) -> object:
    return client.post(
        _REGISTER,
        json={"username": username, "email": email, "password": password},
    )


def _login(client: TestClient, identifier: str, password: str) -> object:
    return client.post(
        _LOGIN,
        json={"username_or_email": identifier, "password": password},
    )


@pytest.fixture(autouse=True)
def _cleanup() -> Iterator[None]:
    yield
    session = get_session_factory()()
    try:
        session.execute(delete(User).where(User.username.like(f"{_PREFIX}%")))
        session.commit()
    finally:
        session.close()


def test_register_creates_user_with_argon2id_hash(client: TestClient) -> None:
    username = _username()
    email = _email(username)

    response = _register(client, username, email, _STRONG_PASSWORD)

    assert response.status_code == 201
    body = response.json()
    assert body["username"] == username
    assert body["display_name"] == username
    assert "password" not in body
    assert "password_hash" not in body

    session = get_session_factory()()
    try:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        assert user.password_hash.startswith("$argon2id$")
        assert user.password_hash != _STRONG_PASSWORD
        assert _STRONG_PASSWORD not in user.password_hash
        assert user.email == email
    finally:
        session.close()


def test_duplicate_username_answers_409_in_envelope(client: TestClient) -> None:
    username = _username()
    assert _register(client, username, _email(username), _STRONG_PASSWORD).status_code == 201

    response = _register(client, username, _email(_username("other")), _STRONG_PASSWORD)

    assert response.status_code == 409
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "conflict"


def test_duplicate_email_answers_409_in_envelope(client: TestClient) -> None:
    username = _username()
    email = _email(username)
    assert _register(client, username, email, _STRONG_PASSWORD).status_code == 201

    response = _register(client, _username("other"), email, _STRONG_PASSWORD)

    assert response.status_code == 409
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "conflict"


@pytest.mark.parametrize(
    "password",
    [
        "Short-1!",  # too short
        "alllowercase-1234",  # no upper-case letter
        "ALLUPPERCASE-1234",  # no lower-case letter
        "NoDigitsHere!Aa",  # no digit
        "NoSpecialChar123A",  # no special character
    ],
)
def test_weak_password_answers_422_with_field_message(client: TestClient, password: str) -> None:
    response = _register(client, _username(), _email(_username()), password)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    details = body["error"]["details"]
    assert isinstance(details, list)
    fields = {entry["field"] for entry in details}
    assert "password" in fields
    assert all(entry["message"] for entry in details)


def test_login_sets_refresh_cookie_and_returns_access_token(client: TestClient) -> None:
    username = _username()
    email = _email(username)
    assert _register(client, username, email, _STRONG_PASSWORD).status_code == 201

    response = _login(client, username, _STRONG_PASSWORD)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    assert body["access_token"]
    assert body["user"]["username"] == username

    payload = decode_access_token(body["access_token"])
    assert payload["role"] == "user"
    assert payload["type"] == "access"

    set_cookie = response.headers.get("set-cookie", "")
    assert "refresh_token=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/api/v1/auth" in set_cookie
    match = re.search(r"refresh_token=([^;]+)", set_cookie)
    assert match is not None
    cookie_value = match.group(1)
    assert cookie_value
    assert cookie_value not in response.text


def test_login_accepts_email(client: TestClient) -> None:
    username = _username()
    email = _email(username)
    assert _register(client, username, email, _STRONG_PASSWORD).status_code == 201

    response = _login(client, email, _STRONG_PASSWORD)

    assert response.status_code == 200
    assert response.json()["user"]["email"] == email


def test_refresh_token_is_stored_hashed_never_plaintext(client: TestClient) -> None:
    username = _username()
    email = _email(username)
    assert _register(client, username, email, _STRONG_PASSWORD).status_code == 201
    response = _login(client, username, _STRONG_PASSWORD)
    cookie_value = re.search(r"refresh_token=([^;]+)", response.headers["set-cookie"]).group(1)

    session = get_session_factory()()
    try:
        user = session.execute(select(User).where(User.username == username)).scalar_one()
        token = session.execute(
            select(RefreshToken).where(RefreshToken.user_id == user.id)
        ).scalar_one()
        assert token.token_hash != cookie_value
        assert token.token_hash == hash_refresh_token(cookie_value)
        assert token.revoked is False
    finally:
        session.close()


def test_login_with_wrong_password_answers_401_in_envelope(client: TestClient) -> None:
    username = _username()
    email = _email(username)
    assert _register(client, username, email, _STRONG_PASSWORD).status_code == 201

    response = _login(client, username, "Wrong-Password-1!")

    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "unauthorized"


def test_login_with_unknown_user_answers_401_in_envelope(client: TestClient) -> None:
    response = _login(client, _username(), _STRONG_PASSWORD)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
