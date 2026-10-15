"""Subscription response schema.

The only body the subscription endpoints return is the state of the caller's
subscription for a thread: ``{"subscribed": bool}``.
"""

from __future__ import annotations

from pydantic import BaseModel


class SubscriptionState(BaseModel):
    """Whether the authenticated user is subscribed to a thread."""

    subscribed: bool
