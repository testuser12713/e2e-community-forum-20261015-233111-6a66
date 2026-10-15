"""Admin dashboard statistics: exact aggregates and the role guard.

These tests run against the real PostgreSQL database (see ``conftest.py``). They
seed their own uniquely-marked rows in ``user``, ``thread``, ``comment`` and
``report``, and delete exactly the rows they created afterwards. Every assertion
is a delta against the state before seeding, so the suite stays correct however
many other rows a parallel ticket happens to leave behind.
"""

from __future__ import annotations

import secrets
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_session_factory
from app.models import Category, Comment, Report, Thread, User
from app.security import create_access_token, hash_password
from app.services.admin_stats import compute_admin_stats

STATS_FIELDS = {
    "total_users",
    "new_users_7d",
    "total_threads",
    "total_comments",
    "comments_today",
    "comments_7d",
    "open_reports",
}


def _unique(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(8)}"


class Seeder:
    """Creates uniquely-marked rows and remembers their ids for cleanup."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.ids: dict[str, list[int]] = {
            "categories": [],
            "users": [],
            "threads": [],
            "comments": [],
            "reports": [],
        }

    def user(
        self,
        *,
        role: str = "user",
        created_at: datetime | None = None,
        is_banned: bool = False,
    ) -> User:
        user = User(
            username=_unique("stats-user"),
            email=f"{_unique('stats')}@example.test",
            password_hash=hash_password("Correct-Horse-Battery-1!"),
            display_name="Statistik Test",
            role=role,
            is_banned=is_banned,
        )
        if created_at is not None:
            user.created_at = created_at
        self.session.add(user)
        self.session.flush()
        self.ids["users"].append(user.id)
        return user

    def category(self) -> Category:
        category = Category(
            name=_unique("stats-category"),
            slug=_unique("stats-category"),
            position=0,
        )
        self.session.add(category)
        self.session.flush()
        self.ids["categories"].append(category.id)
        return category

    def thread(
        self,
        *,
        author: User,
        category: Category,
        deleted: bool = False,
    ) -> Thread:
        thread = Thread(
            category_id=category.id,
            author_id=author.id,
            title="Statistik Thread",
            body_markdown="Inhalt",
            tags=[],
        )
        if deleted:
            thread.is_deleted = True
            thread.deleted_at = datetime.now(UTC)
        self.session.add(thread)
        self.session.flush()
        self.ids["threads"].append(thread.id)
        return thread

    def comment(
        self,
        *,
        author: User,
        thread: Thread,
        created_at: datetime | None = None,
        deleted: bool = False,
    ) -> Comment:
        comment = Comment(
            thread_id=thread.id,
            author_id=author.id,
            body_markdown="Kommentar",
            depth=1,
        )
        if created_at is not None:
            comment.created_at = created_at
        if deleted:
            comment.is_deleted = True
            comment.deleted_at = datetime.now(UTC)
        self.session.add(comment)
        self.session.flush()
        self.ids["comments"].append(comment.id)
        return comment

    def report(self, *, reporter: User, status: str = "open") -> Report:
        report = Report(
            content_type="thread",
            content_id=1,
            reason="spam",
            reporter_id=reporter.id,
            status=status,
        )
        self.session.add(report)
        self.session.flush()
        self.ids["reports"].append(report.id)
        return report

    def cleanup(self) -> None:
        session = self.session
        session.execute(delete(Comment).where(Comment.id.in_(self.ids["comments"])))
        session.execute(delete(Report).where(Report.id.in_(self.ids["reports"])))
        session.execute(delete(Thread).where(Thread.id.in_(self.ids["threads"])))
        session.execute(delete(Category).where(Category.id.in_(self.ids["categories"])))
        session.execute(delete(User).where(User.id.in_(self.ids["users"])))
        session.commit()


@pytest.fixture
def seeder() -> Iterator[Seeder]:
    session = get_session_factory()()
    helper = Seeder(session)
    try:
        yield helper
    finally:
        helper.cleanup()
        session.close()


def _auth_header(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def test_stats_match_seeded_rows(seeder: Seeder) -> None:
    now = datetime.now(UTC)
    before = compute_admin_stats(seeder.session, now=now)

    admin = seeder.user(role="admin")
    seeder.user()  # registered now -> counts in the 7-day window
    seeder.user(created_at=now - timedelta(days=30))  # older than 7 days

    category = seeder.category()
    thread = seeder.thread(author=admin, category=category)
    seeder.thread(author=admin, category=category, deleted=True)

    seeder.comment(author=admin, thread=thread, created_at=now)  # today + 7d
    seeder.comment(author=admin, thread=thread, created_at=now - timedelta(days=3))  # 7d only
    seeder.comment(author=admin, thread=thread, created_at=now - timedelta(days=10))  # neither
    seeder.comment(author=admin, thread=thread, created_at=now, deleted=True)  # deleted

    seeder.report(reporter=admin, status="open")
    seeder.report(reporter=admin, status="open")
    seeder.report(reporter=admin, status="resolved")

    seeder.session.commit()
    after = compute_admin_stats(seeder.session, now=now)

    assert after.total_users - before.total_users == 3
    assert after.new_users_7d - before.new_users_7d == 2
    assert after.total_threads - before.total_threads == 1
    assert after.total_comments - before.total_comments == 3
    assert after.comments_today - before.comments_today == 1
    assert after.comments_7d - before.comments_7d == 2
    assert after.open_reports - before.open_reports == 2


def test_banned_user_still_counted(seeder: Seeder) -> None:
    before = compute_admin_stats(seeder.session)
    seeder.user(is_banned=True)
    seeder.session.commit()
    after = compute_admin_stats(seeder.session)
    assert after.total_users - before.total_users == 1


def test_admin_endpoint_returns_the_stats(seeder: Seeder, client: TestClient) -> None:
    admin = seeder.user(role="admin")
    reporter = seeder.user()
    seeder.report(reporter=reporter, status="open")
    seeder.session.commit()

    response = client.get("/api/v1/admin/stats", headers=_auth_header(admin))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == STATS_FIELDS
    assert all(isinstance(value, int) for value in body.values())
    assert body == {
        field: getattr(compute_admin_stats(seeder.session), field) for field in STATS_FIELDS
    }


@pytest.mark.parametrize("role", ["user", "moderator"])
def test_non_admin_answers_403(seeder: Seeder, client: TestClient, role: str) -> None:
    user = seeder.user(role=role)
    seeder.session.commit()

    response = client.get("/api/v1/admin/stats", headers=_auth_header(user))

    assert response.status_code == 403
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}


def test_unauthenticated_answers_401(client: TestClient) -> None:
    response = client.get("/api/v1/admin/stats")
    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
