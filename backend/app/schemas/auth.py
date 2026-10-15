"""Request bodies for the authentication endpoints.

The response models live in :mod:`app.schemas.common` (``UserOut``, ``AuthOut``)
and are imported by the router. Only the request shapes are declared here, with
the password policy enforced server-side so a weak password is a 422 with a
field-level message.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, field_validator
from pydantic_core import PydanticCustomError

_UPPER = re.compile(r"[A-Z]")
_LOWER = re.compile(r"[a-z]")
_DIGIT = re.compile(r"[0-9]")
_SPECIAL = re.compile(r"[^A-Za-z0-9]")

PASSWORD_MIN_LENGTH = 12


def validate_password_policy(value: str) -> str:
    """Return ``value`` when it satisfies the password policy, else raise."""
    if len(value) < PASSWORD_MIN_LENGTH:
        raise PydanticCustomError(
            "password_too_short",
            "Das Passwort muss mindestens 12 Zeichen haben.",
        )
    if not _UPPER.search(value):
        raise PydanticCustomError(
            "password_missing_upper",
            "Das Passwort muss einen Großbuchstaben enthalten.",
        )
    if not _LOWER.search(value):
        raise PydanticCustomError(
            "password_missing_lower",
            "Das Passwort muss einen Kleinbuchstaben enthalten.",
        )
    if not _DIGIT.search(value):
        raise PydanticCustomError(
            "password_missing_digit",
            "Das Passwort muss eine Ziffer enthalten.",
        )
    if not _SPECIAL.search(value):
        raise PydanticCustomError(
            "password_missing_special",
            "Das Passwort muss ein Sonderzeichen enthalten.",
        )
    return value


class RegisterInput(BaseModel):
    """``POST /api/v1/auth/register`` body."""

    username: str
    email: str
    password: str

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_policy(value)


class LoginInput(BaseModel):
    """``POST /api/v1/auth/login`` body — username or e-mail both accepted."""

    username_or_email: str
    password: str
