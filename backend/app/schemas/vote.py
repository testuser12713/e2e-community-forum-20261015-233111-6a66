"""Vote request and response schemas.

The response shape ``VoteOut`` is the shared contract model declared in
``app.schemas.common``; this module re-exports it and adds the request body the
two vote routes accept.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.common import VoteOut

__all__ = ["VoteIn", "VoteOut"]


class VoteIn(BaseModel):
    """Body of ``POST .../vote`` — exactly an up (+1) or a down (-1)."""

    value: Literal[1, -1]
