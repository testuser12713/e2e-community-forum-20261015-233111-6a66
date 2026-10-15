"""FastAPI application factory for the community forum API.

Builds the app once and completely: every router is registered, CORS is
installed for the configured origins, the shared error handlers are mounted and
a freshly started process brings its PostgreSQL schema to ``head``.

Each router declares its full contract path; the app registers them as-is so no
route is ever served under a second spelling.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import dispose_engine, run_migrations
from app.errors import install_handlers
from app.routers import (
    admin_audit,
    admin_categories,
    admin_stats,
    admin_users,
    auth,
    categories,
    comments,
    feed,
    health,
    moderation,
    notifications,
    reports,
    search,
    subscriptions,
    threads,
    users,
    votes,
)

_ROUTERS = (
    health.router,
    auth.router,
    users.router,
    categories.router,
    admin_categories.router,
    feed.router,
    threads.router,
    comments.router,
    votes.router,
    search.router,
    subscriptions.router,
    notifications.router,
    reports.router,
    moderation.router,
    admin_stats.router,
    admin_users.router,
    admin_audit.router,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Validate configuration and bring the schema to ``head`` before serving."""
    get_settings()
    run_migrations()
    try:
        yield
    finally:
        dispose_engine()


def create_app() -> FastAPI:
    """Build and return the configured FastAPI application."""
    app = FastAPI(
        title="Community Forum API",
        version="0.1.0",
        lifespan=lifespan,
        # Only the exact declared path is served: no automatic trailing-slash
        # redirect, which would answer a second spelling the contract never
        # agreed to.
        redirect_slashes=False,
    )

    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    install_handlers(app)

    for router in _ROUTERS:
        app.include_router(router)

    return app


app = create_app()
