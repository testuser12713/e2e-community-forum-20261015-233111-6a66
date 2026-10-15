"""Shared error handling: every failure answers the contract envelope.

``{"error": {"code": <snake_case>, "message": <str>, "details": <object|list|null>}}``
for 400, 401, 403, 404, 409, 422, 429 and 5xx alike.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")

_STATUS_CODES: dict[int, str] = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    501: "not_implemented",
    503: "service_unavailable",
}

_LOCATIONS = {"body", "query", "path", "header", "cookie"}


def _envelope(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


def code_for_status(status_code: int) -> str:
    """Return the snake_case error code for an HTTP status."""
    return _STATUS_CODES.get(status_code, "error")


def api_error(
    status_code: int,
    message: str,
    *,
    code: str | None = None,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """Build an ``HTTPException`` already carrying the shared envelope."""
    payload = _envelope(code or code_for_status(status_code), message, details)
    return HTTPException(status_code=status_code, detail=payload, headers=headers)


def not_implemented(message: str) -> HTTPException:
    """Build the 501 a stub route answers, in the shared envelope."""
    return api_error(501, message)


def _field_from_loc(loc: tuple[Any, ...]) -> str:
    parts = [str(part) for part in loc]
    if parts and parts[0] in _LOCATIONS:
        parts = parts[1:]
    return ".".join(parts)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Wrap any ``HTTPException`` into the shared envelope."""
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        body = detail
    else:
        body = _envelope(code_for_status(exc.status_code), str(detail), None)
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Turn request validation errors into a 422 with field-level details."""
    details = [
        {
            "field": _field_from_loc(error.get("loc", ())),
            "message": error.get("msg", "Invalid value"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=_envelope("validation_error", "Validation failed", details),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Answer 500 in the envelope, inside the CORS layer, so headers survive."""
    logger.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=_envelope("internal_error", "Internal Server Error", None),
    )


def install_handlers(app: FastAPI) -> None:
    """Register the envelope handlers on ``app``."""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
