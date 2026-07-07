"""Tier and quota definitions.

This is the single place where offerings are configured. Endpoints never
encode policy: they ask quota_service for a decision and act on it, so
changing a limit, a period, or what happens at the limit is an edit here.

Tiers are entitlement levels, not roles ("unlimited" is for internal/team
accounts; an admin *role* is a separate concern). users.tier selects the
plan; when real subscriptions arrive, billing becomes the writer of
users.tier and nothing else changes.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class QuotaPeriod(str, Enum):
    DAY = "day"
    MONTH = "month"
    LIFETIME = "lifetime"


class OnExceed(str, Enum):
    BLOCK = "block"   # deny the action (HTTP 429 with structured body)
    WARN = "warn"     # allow the action, surface a warning to the client
    ALLOW = "allow"   # track usage only; no user-visible effect


@dataclass(frozen=True)
class QuotaRule:
    limit: Optional[int]          # None = unmetered
    period: QuotaPeriod
    on_exceed: OnExceed = OnExceed.BLOCK
    warn_at: float = 0.8          # fraction of limit that flags a warning


# Quota names are the stable contract shared with the frontend; add new
# metered actions here and in quota_service's recording helpers.
ARTWORK_UPLOADS = "artwork_uploads"
TOKENS = "tokens"
STORED_ARTWORKS = "stored_artworks"

PLANS: dict[str, dict[str, QuotaRule]] = {
    "free": {
        ARTWORK_UPLOADS: QuotaRule(limit=10, period=QuotaPeriod.DAY, on_exceed=OnExceed.BLOCK),
        TOKENS: QuotaRule(limit=500_000, period=QuotaPeriod.MONTH, on_exceed=OnExceed.WARN),
        STORED_ARTWORKS: QuotaRule(limit=20, period=QuotaPeriod.LIFETIME, on_exceed=OnExceed.BLOCK),
    },
    "unlimited": {
        ARTWORK_UPLOADS: QuotaRule(limit=None, period=QuotaPeriod.DAY),
        TOKENS: QuotaRule(limit=None, period=QuotaPeriod.MONTH),
        STORED_ARTWORKS: QuotaRule(limit=None, period=QuotaPeriod.LIFETIME),
    },
}

DEFAULT_TIER = "free"


def get_plan(tier: Optional[str]) -> dict[str, QuotaRule]:
    return PLANS.get(tier or DEFAULT_TIER, PLANS[DEFAULT_TIER])
