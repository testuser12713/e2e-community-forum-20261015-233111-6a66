"""Response shape of the admin dashboard statistics endpoint.

``AdminStats`` is declared once, in :mod:`app.schemas.common`, because it is part
of the shared API contract that every ticket imports. This module only
re-exposes it under the path the admin-stats ticket expects, so there is a single
authoritative definition of the shape and no second copy to drift from it.
"""

from __future__ import annotations

from app.schemas.common import AdminStats

__all__ = ["AdminStats"]
