"""Write rate limiting is scoped to the content writes (AC-25).

Only threads, comments, votes and reports may answer 429 when the configured
limit is exceeded. The auth-session routes, subscription writes, admin routes and
every read keep their regular status code, even while a caller's write bucket is
exhausted. Runs against the real PostgreSQL-backed application (``conftest``).
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import reset_settings_cache
from app.services.ratelimit import reset_rate_limiter

_WRITE_PATH = "/api/v1/threads"


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


def test_auth_session_routes_never_answer_429(client: TestClient) -> None:
    # More attempts than the write limit; none of them is a throttled write.
    for _ in range(6):
        response = client.post("/api/v1/auth/login", json={})
        assert response.status_code != 429


def test_reads_never_answer_429_while_the_write_bucket_is_full(client: TestClient) -> None:
    for _ in range(3):
        client.post(_WRITE_PATH)
    assert client.post(_WRITE_PATH).status_code == 429

    listing = client.get(_WRITE_PATH)
    assert listing.status_code != 429


def test_unauthenticated_comment_write_answers_401_not_429(client: TestClient) -> None:
    # Auth calls must not consume the (separate) write bucket.
    for _ in range(5):
        client.post("/api/v1/auth/login", json={})

    response = client.post("/api/v1/threads/1/comments", json={"body": "anonymous"})
    assert response.status_code == 401


def test_subscription_writes_are_not_throttled(client: TestClient) -> None:
    for _ in range(6):
        response = client.post("/api/v1/threads/1/subscription")
        assert response.status_code != 429


def test_report_write_is_throttled(client: TestClient) -> None:
    for _ in range(3):
        assert client.post("/api/v1/reports").status_code != 429
    assert client.post("/api/v1/reports").status_code == 429
