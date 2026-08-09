"""Quota decisions and usage recording — the single enforcement choke point.

Endpoints call check_quota() before a metered action and act on the returned
decision; they never read plan config directly. Policy (limits, periods,
what happens at the limit) lives entirely in app/config/plans.py.
"""
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import func as sa_func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.config.plans import (
    ARTWORK_UPLOADS,
    STORED_ARTWORKS,
    TOKENS,
    OnExceed,
    QuotaPeriod,
    QuotaRule,
    get_plan,
)
from app.database.models import DailyUsage, SavedArtwork, User

logger = logging.getLogger(__name__)


@dataclass
class QuotaStatus:
    quota: str
    limit: Optional[int]
    used: int
    period: str
    resets_at: Optional[str]
    warning: bool = False
    exceeded: bool = False


@dataclass
class QuotaDecision:
    allowed: bool
    quota: str
    status: QuotaStatus
    on_exceed: str = OnExceed.BLOCK.value

    def to_error_body(self) -> dict:
        # The structured 429 contract the frontend builds UI on.
        return {
            "error_code": "quota_exceeded",
            "quota": self.quota,
            "limit": self.status.limit,
            "used": self.status.used,
            "resets_at": self.status.resets_at,
        }


def _period_start(period: QuotaPeriod, today: date) -> Optional[date]:
    if period == QuotaPeriod.DAY:
        return today
    if period == QuotaPeriod.MONTH:
        return today.replace(day=1)
    return None  # lifetime


def _resets_at(period: QuotaPeriod, today: date) -> Optional[str]:
    if period == QuotaPeriod.DAY:
        return datetime.combine(today + timedelta(days=1), datetime.min.time()).isoformat() + "Z"
    if period == QuotaPeriod.MONTH:
        next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
        return datetime.combine(next_month, datetime.min.time()).isoformat() + "Z"
    return None


def _usage_for(db: Session, user_id: str, quota: str, rule: QuotaRule, today: date) -> int:
    if quota == STORED_ARTWORKS:
        # Derived, not counted: the artwork table is the truth.
        return db.query(sa_func.count(SavedArtwork.id)).filter(
            SavedArtwork.user_id == user_id,
            SavedArtwork.active_filter(),
        ).scalar() or 0

    start = _period_start(rule.period, today)
    query = db.query(
        sa_func.coalesce(sa_func.sum(DailyUsage.tokens_in + DailyUsage.tokens_out), 0),
        sa_func.coalesce(sa_func.sum(DailyUsage.artworks_uploaded), 0),
    ).filter(DailyUsage.user_id == user_id)
    if start is not None:
        query = query.filter(DailyUsage.day >= start)
    tokens, uploads = query.one()
    return int(tokens) if quota == TOKENS else int(uploads)


def _status_for(db: Session, user_id: str, tier: Optional[str], quota: str, today: date) -> tuple[QuotaStatus, QuotaRule]:
    rule = get_plan(tier)[quota]
    used = _usage_for(db, user_id, quota, rule, today)
    status = QuotaStatus(
        quota=quota,
        limit=rule.limit,
        used=used,
        period=rule.period.value,
        resets_at=_resets_at(rule.period, today),
    )
    if rule.limit is not None:
        status.exceeded = used >= rule.limit
        status.warning = not status.exceeded and used >= rule.limit * rule.warn_at
    return status, rule


def check_quota(db: Session, user_id: str, quota: str) -> QuotaDecision:
    """Decide whether a metered action may proceed for this user right now."""
    user = db.query(User).filter(User.user_id == user_id).first()
    tier = user.tier if user else None
    status, rule = _status_for(db, user_id, tier, quota, date.today())

    blocked = status.exceeded and rule.on_exceed == OnExceed.BLOCK
    return QuotaDecision(
        allowed=not blocked,
        quota=quota,
        status=status,
        on_exceed=rule.on_exceed.value,
    )


def record_artwork_upload(db: Session, user_id: str, count: int = 1) -> None:
    _upsert_daily(db, user_id, artworks_uploaded=count)


def record_token_usage(db: Session, user_id: str, tokens_in: int = 0, tokens_out: int = 0) -> None:
    if not tokens_in and not tokens_out:
        return
    _upsert_daily(db, user_id, tokens_in=tokens_in, tokens_out=tokens_out)


def _upsert_daily(db: Session, user_id: str, *, tokens_in: int = 0, tokens_out: int = 0, artworks_uploaded: int = 0) -> None:
    """Atomic increment; safe under concurrency, no read-modify-write race."""
    try:
        dialect = db.get_bind().dialect.name
        insert_fn = sqlite_insert if dialect == "sqlite" else pg_insert
        stmt = insert_fn(DailyUsage).values(
            user_id=user_id,
            day=date.today(),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            artworks_uploaded=artworks_uploaded,
        ).on_conflict_do_update(
            index_elements=["user_id", "day"],
            set_={
                "tokens_in": DailyUsage.tokens_in + tokens_in,
                "tokens_out": DailyUsage.tokens_out + tokens_out,
                "artworks_uploaded": DailyUsage.artworks_uploaded + artworks_uploaded,
                "updated_at": sa_func.now(),
            },
        )
        db.execute(stmt)
        db.commit()
    except Exception:
        # Usage tracking must never break the tracked action.
        logger.exception("Failed to record usage for user %s", user_id)
        db.rollback()


def get_account_usage(db: Session, user_id: str) -> dict:
    """Everything the frontend needs to render meters and pre-disable actions."""
    user = db.query(User).filter(User.user_id == user_id).first()
    tier = (user.tier if user else None) or "free"
    today = date.today()
    quotas = {}
    for quota in get_plan(tier):
        status, rule = _status_for(db, user_id, tier, quota, today)
        quotas[quota] = {
            "limit": status.limit,
            "used": status.used,
            "period": status.period,
            "resets_at": status.resets_at,
            "warning": status.warning,
            "exceeded": status.exceeded,
            "on_exceed": rule.on_exceed.value,
        }
    return {"tier": tier, "quotas": quotas}
