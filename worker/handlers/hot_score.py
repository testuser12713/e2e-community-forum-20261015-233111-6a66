"""Handler for the ``thread.hot_score`` job.

The signature is complete so the hot-score handler ticket depends only on this
skeleton; the body implements no product logic yet.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


def handle(db: Session, payload: dict[str, Any]) -> None:
    """Recompute the hot score of the threads named in ``payload``.

    Payload: ``{"thread_ids": list[int] | None}`` — ``None`` means every live
    thread.
    """
