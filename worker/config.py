"""Worker configuration, read lazily from the environment.

No secret value is committed to the repository: ``DATABASE_URL`` (the
PostgreSQL address) and the poll interval come from the environment and are
declared in ``RUN.json``. Reading happens inside :func:`get_settings`, never at
import time, so a missing variable is reported by name instead of killing the
process before it can log anything.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_POLL_INTERVAL_SECONDS = 5.0


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing or malformed."""


def env_float(name: str, default: float) -> float:
    """Read a positive float from the environment, falling back to ``default``."""
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from exc
    if value <= 0:
        raise ConfigError(f"{name} must be positive, got {raw!r}")
    return value


@dataclass(frozen=True)
class Settings:
    """The worker's runtime configuration."""

    database_url: str
    poll_interval: float


def get_settings() -> Settings:
    """Build the settings object from the current environment.

    Reads the environment at call time (never at import time) and fails with a
    message that names the missing variable.
    """
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise ConfigError(
            "DATABASE_URL is not set — the worker cannot reach PostgreSQL. "
            "Declare it in RUN.json (it is the ${service:db.url} placeholder)."
        )
    return Settings(
        database_url=database_url,
        poll_interval=env_float("WORKER_POLL_INTERVAL", DEFAULT_POLL_INTERVAL_SECONDS),
    )
