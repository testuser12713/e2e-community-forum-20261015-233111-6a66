"""Write rate limiting (AC-25): per-user sliding window answering 429.

The suite runs against the real PostgreSQL-backed application (``conftest``);
the limiter itself keeps its window in-process. Each test lowers the limit and
clears the recorded hits before it runs.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import reset_settings_cache
from app.security import create_access_token
from app.services.ratelimit import reset_rate_limiter

_WRITE_PATH = "/api/v1/threads"
_READ_PATH = "/health"


@pytest.fixture(autouse=True)
def _small_limit(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Three writes per 60 s window, with a clean bucket for every test."""
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "3")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")
    reset_settings_cache()
    reset_rate_limiter()
    try:
        yield
    finally:
        reset_settings_cache()
        reset_rate_limiter()


def test_writes_under_the_limit_pass(client: TestClient) -> None:
    for _ in range(3):
        response = client.post(_WRITE_PATH)
        assert response.status_code != 429


def test_write_over_the_limit_answers_429_with_retry_after(client: TestClient) -> None:
    for _ in range(3):
        assert client.post(_WRITE_PATH).status_code != 429

    response = client.post(_WRITE_PATH)

    assert response.status_code == 429
    retry_after = response.headers.get("Retry-After")
    assert retry_after is not None
    assert int(retry_after) >= 1

    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "rate_limited"


def test_reads_keep_working_while_writes_are_blocked(client: TestClient) -> None:
    for _ in range(3):
        client.post(_WRITE_PATH)
    assert client.post(_WRITE_PATH).status_code == 429

    read = client.get(_READ_PATH)
    assert read.status_code == 200
    assert read.json() == {"status": "ok"}


def test_each_user_has_its_own_window(client: TestClient) -> None:
    first = create_access_token(101, "user")
    second = create_access_token(202, "user")
    first_headers = {"Authorization": f"Bearer {first}"}
    second_headers = {"Authorization": f"Bearer {second}"}

    for _ in range(3):
        assert client.post(_WRITE_PATH, headers=first_headers).status_code != 429
    assert client.post(_WRITE_PATH, headers=first_headers).status_code == 429

    # A different user's bucket is untouched by the first one being blocked.
    assert client.post(_WRITE_PATH, headers=second_headers).status_code != 429
