"""Write rate limiting.

Declared as a dependency on every write route. The body is filled by the
write-rate-limit ticket; the signature is the shared contract.
"""

from __future__ import annotations

from fastapi import Request


def rate_limit_write(request: Request) -> None:
    """Reject a write once the caller exceeds the configured rate limit."""
    return None
