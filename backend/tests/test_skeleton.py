"""Skeleton acceptance: health, the full contract route table, error envelope.

The OpenAPI document is read directly (never through a request) so these tests
stay valid once the stub routes are filled in by their own tickets.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pagination import make_page, normalize_page, page_count
from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.services.rendering import render_markdown

CONTRACT_ROUTES: list[tuple[str, str]] = [
    ("get", "/health"),
    ("post", "/api/v1/auth/register"),
    ("post", "/api/v1/auth/login"),
    ("post", "/api/v1/auth/refresh"),
    ("post", "/api/v1/auth/logout"),
    ("post", "/api/v1/auth/change-password"),
    ("get", "/api/v1/users/me"),
    ("patch", "/api/v1/users/me"),
    ("get", "/api/v1/users/{username}"),
    ("get", "/api/v1/users/{username}/threads"),
    ("get", "/api/v1/users/{username}/comments"),
    ("get", "/api/v1/categories"),
    ("get", "/api/v1/categories/{slug}"),
    ("post", "/api/v1/admin/categories"),
    ("patch", "/api/v1/admin/categories/{id}"),
    ("put", "/api/v1/admin/categories/order"),
    ("get", "/api/v1/threads"),
    ("get", "/api/v1/threads/{id}"),
    ("post", "/api/v1/threads"),
    ("patch", "/api/v1/threads/{id}"),
    ("delete", "/api/v1/threads/{id}"),
    ("post", "/api/v1/threads/{id}/vote"),
    ("post", "/api/v1/comments/{id}/vote"),
    ("get", "/api/v1/threads/{id}/comments"),
    ("post", "/api/v1/threads/{id}/comments"),
    ("patch", "/api/v1/comments/{id}"),
    ("delete", "/api/v1/comments/{id}"),
    ("get", "/api/v1/threads/{id}/subscription"),
    ("post", "/api/v1/threads/{id}/subscription"),
    ("delete", "/api/v1/threads/{id}/subscription"),
    ("get", "/api/v1/search"),
    ("post", "/api/v1/reports"),
    ("get", "/api/v1/notifications"),
    ("get", "/api/v1/notifications/unread-count"),
    ("post", "/api/v1/notifications/{id}/read"),
    ("post", "/api/v1/notifications/read-all"),
    ("post", "/api/v1/threads/{id}/moderate"),
    ("get", "/api/v1/moderation/reports"),
    ("post", "/api/v1/moderation/reports/{id}/resolve"),
    ("get", "/api/v1/admin/stats"),
    ("get", "/api/v1/admin/users"),
    ("patch", "/api/v1/admin/users/{id}/role"),
    ("post", "/api/v1/admin/users/{id}/ban"),
    ("delete", "/api/v1/admin/users/{id}/ban"),
    ("get", "/api/v1/admin/audit-logs"),
]


def test_health_answers_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_lists_every_contract_route() -> None:
    schema = app.openapi()
    paths = schema["paths"]
    missing: list[str] = []
    for method, path in CONTRACT_ROUTES:
        if path not in paths or method not in paths[path]:
            missing.append(f"{method.upper()} {path}")
    assert missing == [], f"routes missing from OpenAPI: {missing}"


def test_unknown_path_answers_404_in_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/this-route-does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "not_found"


def test_cors_preflight_allows_frontend_origins(client: TestClient) -> None:
    for origin in ("http://localhost:5173", "http://localhost:5174"):
        response = client.options(
            "/api/v1/threads",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert response.status_code in (200, 204)
        assert response.headers.get("access-control-allow-origin") == origin


def test_pagination_helper_produces_page_envelope() -> None:
    assert normalize_page(None, None) == (1, 20)
    assert normalize_page(0, 500) == (1, 100)
    assert page_count(0, 20) == 0
    page = make_page(["a", "b"], page=1, per_page=20, total=2)
    assert page == {"items": ["a", "b"], "page": 1, "per_page": 20, "total": 2, "pages": 1}
    assert make_page([], page=99, per_page=20, total=2)["items"] == []


def test_password_hash_and_verify() -> None:
    digest = hash_password("Correct-Horse-Battery-1!")
    assert digest != "Correct-Horse-Battery-1!"
    assert digest.startswith("$argon2id$")
    assert verify_password("Correct-Horse-Battery-1!", digest) is True
    assert verify_password("wrong", digest) is False


def test_access_token_roundtrip() -> None:
    token = create_access_token(42, "user")
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "user"
    assert payload["type"] == "access"


def test_refresh_token_hash_is_deterministic() -> None:
    assert hash_refresh_token("abc") == hash_refresh_token("abc")
    assert hash_refresh_token("abc") != hash_refresh_token("abcd")


def test_markdown_is_sanitised() -> None:
    html = render_markdown("**bold** <script>alert(1)</script> [x](javascript:alert(1))")
    assert "<strong>bold</strong>" in html
    assert "<script>" not in html


@pytest.mark.parametrize("method,path", CONTRACT_ROUTES)
def test_contract_route_is_not_a_404(client: TestClient, method: str, path: str) -> None:
    """A parameterless contract route is wired (it never answers 404).

    Routes carrying a path parameter are skipped: once such a route is real, a
    well-formed probe for a missing resource legitimately answers 404 (the
    contract requires e.g. ``GET /api/v1/categories/{slug}`` to answer 404 for
    an unknown slug). Their wiring is already proven by
    ``test_openapi_lists_every_contract_route`` above, which reads the route
    table instead of a request.
    """
    if "{" in path:
        pytest.skip("parameterised route: 404 is a valid answer for a missing resource")
    response = client.request(method.upper(), path)
    assert response.status_code != 404
