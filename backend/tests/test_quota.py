"""Tests for the quota foundation: plans config, decisions, usage recording."""

import pytest
from fastapi import HTTPException

from app.config.plans import (
    ARTWORK_UPLOADS,
    DEFAULT_TIER,
    PLANS,
    STORED_ARTWORKS,
    TOKENS,
    OnExceed,
    get_plan,
)
from app.database.models import SavedArtwork, User
from app.services.artwork_background_service import check_artwork_quota
from app.services.quota_service import (
    check_quota,
    get_account_usage,
    record_artwork_upload,
    record_token_usage,
)


def _make_user(db, tier="free", uid="u1"):
    u = User(user_id=uid, device_id=uid, tier=tier)
    db.add(u)
    db.commit()
    return u


def _add_artworks(db, user_id, count):
    for i in range(count):
        db.add(SavedArtwork(
            photo_uri=f"r2://img{i}",
            artist_name="Test Artist",
            artwork_name=f"Work {i}",
            user_id=user_id,
        ))
    db.commit()


class TestPlans:
    def test_every_tier_defines_every_quota(self):
        quota_names = set(PLANS[DEFAULT_TIER].keys())
        for tier, plan in PLANS.items():
            assert set(plan.keys()) == quota_names, f"tier {tier} missing quotas"

    def test_unknown_tier_falls_back_to_default(self):
        assert get_plan("nonsense") == PLANS[DEFAULT_TIER]
        assert get_plan(None) == PLANS[DEFAULT_TIER]

    def test_unlimited_tier_is_unmetered(self):
        for rule in PLANS["unlimited"].values():
            assert rule.limit is None


class TestQuotaDecisions:
    def test_under_limit_allows(self, db):
        _make_user(db, uid="u-under")
        record_artwork_upload(db, "u-under")
        decision = check_quota(db, "u-under", ARTWORK_UPLOADS)
        assert decision.allowed
        assert decision.status.used == 1

    def test_daily_upload_limit_blocks(self, db):
        _make_user(db, uid="u-daily")
        limit = PLANS["free"][ARTWORK_UPLOADS].limit
        record_artwork_upload(db, "u-daily", count=limit)
        decision = check_quota(db, "u-daily", ARTWORK_UPLOADS)
        assert not decision.allowed
        assert decision.status.exceeded
        body = decision.to_error_body()
        assert body["error_code"] == "quota_exceeded"
        assert body["quota"] == ARTWORK_UPLOADS
        assert body["resets_at"] is not None

    def test_stored_artworks_derived_from_table(self, db):
        _make_user(db, uid="u-stored")
        limit = PLANS["free"][STORED_ARTWORKS].limit
        _add_artworks(db, "u-stored", limit)
        decision = check_quota(db, "u-stored", STORED_ARTWORKS)
        assert not decision.allowed
        assert decision.status.used == limit

    def test_unlimited_tier_never_blocks(self, db):
        _make_user(db, tier="unlimited", uid="u-unlim")
        record_artwork_upload(db, "u-unlim", count=10_000)
        _add_artworks(db, "u-unlim", 25)
        for quota in (ARTWORK_UPLOADS, STORED_ARTWORKS, TOKENS):
            assert check_quota(db, "u-unlim", quota).allowed

    def test_warn_policy_allows_but_flags(self, db):
        _make_user(db, uid="u-tokens")
        rule = PLANS["free"][TOKENS]
        assert rule.on_exceed == OnExceed.WARN  # policy under test
        record_token_usage(db, "u-tokens", tokens_in=rule.limit, tokens_out=1)
        decision = check_quota(db, "u-tokens", TOKENS)
        assert decision.allowed  # warn never blocks
        assert decision.status.exceeded
        assert decision.on_exceed == "warn"


class TestUsageRecording:
    def test_upserts_accumulate_atomically(self, db):
        _make_user(db, uid="u-acc")
        record_artwork_upload(db, "u-acc")
        record_artwork_upload(db, "u-acc", count=2)
        record_token_usage(db, "u-acc", tokens_in=100, tokens_out=50)
        record_token_usage(db, "u-acc", tokens_in=10)
        usage = get_account_usage(db, "u-acc")
        assert usage["quotas"][ARTWORK_UPLOADS]["used"] == 3
        assert usage["quotas"][TOKENS]["used"] == 160

    def test_zero_tokens_not_recorded(self, db):
        _make_user(db, uid="u-zero")
        record_token_usage(db, "u-zero")
        assert get_account_usage(db, "u-zero")["quotas"][TOKENS]["used"] == 0


class TestAccountUsage:
    def test_shape_covers_all_quotas_with_policy(self, db):
        _make_user(db, uid="u-shape")
        usage = get_account_usage(db, "u-shape")
        assert usage["tier"] == "free"
        for quota, rule in PLANS["free"].items():
            entry = usage["quotas"][quota]
            assert entry["limit"] == rule.limit
            assert entry["on_exceed"] == rule.on_exceed.value
            assert set(entry) >= {"limit", "used", "period", "resets_at", "warning", "exceeded"}


class TestEndpointGuard:
    def test_check_artwork_quota_passes_under_limit(self, db):
        _make_user(db, uid="u-ok")
        check_artwork_quota("u-ok", db)  # should not raise

    def test_check_artwork_quota_blocks_with_legacy_contract(self, db):
        _make_user(db, uid="u-block")
        limit = PLANS["free"][ARTWORK_UPLOADS].limit
        record_artwork_upload(db, "u-block", count=limit)
        with pytest.raises(HTTPException) as exc:
            check_artwork_quota("u-block", db)
        assert exc.value.status_code == 402
        detail = exc.value.detail
        assert detail["code"] == "quota_exceeded"          # legacy key
        assert detail["error_code"] == "quota_exceeded"    # structured key
        assert detail["quota"] == ARTWORK_UPLOADS
        assert "message" in detail and "tier" in detail
