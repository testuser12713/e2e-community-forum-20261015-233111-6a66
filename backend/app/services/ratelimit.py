"""Write rate limiting: a per-user sliding window.

The dependency is declared on every write route (threads, comments, votes,
reports, ...). Reads never pass through it. The limit and the length of the
window come from the environment via :mod:`app.config`; the window state lives
in the API process, one bucket per authenticated user, falling back to the
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
