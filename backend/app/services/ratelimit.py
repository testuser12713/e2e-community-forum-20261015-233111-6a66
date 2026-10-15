"""Write rate limiting: a per-user sliding window.

The spec scopes write throttling to the content writes (threads, comments,
votes, reports), so the guard enforces a limit only there. It is declared on a
broad set of write routes, but :func:`_is_limited_write` narrows it to exactly
those four resources: an auth-session, subscription, moderation, admin or read
request is never counted and can never answer 429. The limit and the length of
the window come from the environment via :mod:`app.config`; the window state
lives in the API process, one bucket per authenticated user, falling back to the
client address for an unauthenticated caller.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque

from fastapi import Request

from app.config import get_settings
from app.errors import api_error
from app.security import TokenError, decode_access_token

__all__ = ["rate_limit_write", "reset_rate_limiter"]

_BEARER_PREFIX = "bearer "

_lock = threading.Lock()
_events: dict[str, deque[float]] = {}


_READ_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _is_limited_write(request: Request) -> bool:
    """Return whether this request targets a spec-scoped content write.

    Only ``Threads``, ``Kommentare``, ``Votes`` and ``Meldungen`` are throttled
    (SPEC: "Ratenbegrenzung beim Schreiben (Threads, Kommentare, Votes,
    Meldungen)"). Everything else the guard happens to be declared on — the auth
    session routes, subscriptions, moderation, admin management, profile edits
    and every read — is out of scope and must keep its regular status code, in
    particular while an unrelated caller's write bucket is exhausted.
    """
    if request.method.upper() in _READ_METHODS:
        return False
    segments = [part for part in request.url.path.split("/") if part]
    if len(segments) < 3 or segments[0] != "api" or segments[1] != "v1":
        return False
    resource, rest = segments[2], segments[3:]

    if resource == "threads":
        if not rest:
            return request.method.upper() == "POST"
        if len(rest) == 1:
            return request.method.upper() in ("PATCH", "DELETE")
        if len(rest) == 2 and rest[1] in ("vote", "comments"):
            return request.method.upper() == "POST"
        return False
    if resource == "comments":
        return len(rest) == 1 and request.method.upper() in ("PATCH", "DELETE")
    if resource == "reports":
        return not rest and request.method.upper() == "POST"
    return False


def _caller_key(request: Request) -> str:
    """Identify the caller: the authenticated user, else the client address."""
    header = request.headers.get("authorization", "")
    if header.lower().startswith(_BEARER_PREFIX):
        token = header[len(_BEARER_PREFIX) :].strip()
        if token:
            try:
                payload = decode_access_token(token)
                return f"user:{int(payload['sub'])}"
            except (TokenError, KeyError, TypeError, ValueError):
                pass
    client = request.client
    host = client.host if client is not None else "unknown"
    return f"ip:{host}"


def _seconds_until_allowed(key: str, limit: int, window: float, now: float) -> int | None:
    """Record a hit for ``key``; return ``None`` when allowed.

    Otherwise return the whole seconds until the oldest hit leaves the window,
    i.e. the value for the ``Retry-After`` header.
    """
    with _lock:
        bucket = _events.setdefault(key, deque())
        cutoff = now - window
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return max(1, math.ceil(bucket[0] + window - now))
        bucket.append(now)
        return None


def rate_limit_write(request: Request) -> None:
    """Reject a write once the caller exceeds the configured rate limit.

    Raises a 429 in the shared error envelope carrying a ``Retry-After`` header
    naming the seconds until the next attempt is allowed.
    """
    if not _is_limited_write(request):
        return
    settings = get_settings()
    limit = settings.rate_limit_per_minute
    if limit <= 0:
        return
    window = float(settings.rate_limit_window_seconds)
    retry_after = _seconds_until_allowed(_caller_key(request), limit, window, time.monotonic())
    if retry_after is not None:
        raise api_error(
            429,
            "Rate limit exceeded. Please try again later.",
            details={"retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


def reset_rate_limiter() -> None:
    """Drop all recorded hits (used by tests that change the environment)."""
    with _lock:
        _events.clear()
