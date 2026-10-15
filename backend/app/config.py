"""Application configuration, read lazily from the environment.

No secret value lives here: every setting arrives through an environment
variable whose name only is declared in ``RUN.json``.
"""

from __future__ import annotations

import os
from functools import lru_cache

_DEFAULT_CORS_ORIGINS = ("http://localhost:5173", "http://localhost:5174")


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing."""


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ConfigError(
            f"{name} is not set. Declare it in RUN.json (or export it) before starting the API."
        )
    return value


def _parse_origins(raw: str) -> list[str]:
    origins: list[str] = []
    for part in raw.split(","):
        origin = part.strip()
        if not origin:
            continue
        # An unresolved ``${service:....origin}`` placeholder means the sibling
        # service is not declared on this branch yet: fall back to the default.
        if "${" in origin:
            continue
        origins.append(origin)
    return origins


class Settings:
    """Runtime settings resolved once, lazily, from the environment."""

    def __init__(self) -> None:
        self.database_url: str = _require("DATABASE_URL")
        self.secret_key: str = _require("SECRET_KEY")

        raw_origins = os.environ.get("CORS_ORIGINS", "")
        origins = _parse_origins(raw_origins)
        self.cors_origins: list[str] = origins or list(_DEFAULT_CORS_ORIGINS)

        self.rate_limit_per_minute: int = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "30"))

    @property
    def access_token_ttl(self) -> int:
        return 900

    @property
    def refresh_token_ttl(self) -> int:
        return 30 * 24 * 60 * 60


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process settings, building them on first use.

    Reading configuration lazily keeps an import of this module from crashing
    when a variable is missing; startup validation calls this once on purpose.
    """
    return Settings()


def reset_settings_cache() -> None:
    """Drop the cached settings (used by tests that change the environment)."""
    get_settings.cache_clear()
