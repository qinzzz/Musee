"""Unit tests for quota enforcement logic."""

import pytest
from fastapi import HTTPException
from app.services.artwork_background_service import (
    TIER_ARTWORK_LIMIT,
    check_artwork_quota,
    get_quota,
)
from app.database.models import User, SavedArtwork


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


class TestGetQuota:
    def test_free_tier(self):
        assert get_quota("free") == 20

    def test_member_tier(self):
        assert get_quota("member") == 200

    def test_power_tier(self):
        assert get_quota("power") is None  # unlimited

    def test_unknown_tier_defaults_to_free(self):
        assert get_quota("unknown") == 20

    def test_empty_string_defaults_to_free(self):
        assert get_quota("") == 20


class TestCheckArtworkQuota:
    def test_allows_below_limit(self, db):
        _make_user(db, tier="free", uid="u-below")
        _add_artworks(db, "u-below", 19)
        check_artwork_quota("u-below", db)  # should not raise

    def test_raises_at_limit(self, db):
        _make_user(db, tier="free", uid="u-at")
        _add_artworks(db, "u-at", 20)
        with pytest.raises(HTTPException) as exc:
            check_artwork_quota("u-at", db)
        assert exc.value.status_code == 402
        assert exc.value.detail["code"] == "quota_exceeded"
        assert exc.value.detail["limit"] == 20

    def test_raises_over_limit(self, db):
        _make_user(db, tier="free", uid="u-over")
        _add_artworks(db, "u-over", 25)
        with pytest.raises(HTTPException) as exc:
            check_artwork_quota("u-over", db)
        assert exc.value.status_code == 402

    def test_power_user_unlimited(self, db):
        _make_user(db, tier="power", uid="u-power")
        _add_artworks(db, "u-power", 500)
        check_artwork_quota("u-power", db)  # should not raise

    def test_member_tier_limit(self, db):
        _make_user(db, tier="member", uid="u-member")
        _add_artworks(db, "u-member", 200)
        with pytest.raises(HTTPException) as exc:
            check_artwork_quota("u-member", db)
        assert exc.value.detail["limit"] == 200

    def test_unknown_user_defaults_to_free_limit(self, db):
        _add_artworks(db, "nonexistent", 20)
        # User doesn't exist — tier defaults to free
        with pytest.raises(HTTPException) as exc:
            check_artwork_quota("nonexistent", db)
        assert exc.value.detail["tier"] == "free"


class TestTierLimits:
    def test_all_tiers_defined(self):
        assert "free" in TIER_ARTWORK_LIMIT
        assert "member" in TIER_ARTWORK_LIMIT
        assert "power" in TIER_ARTWORK_LIMIT

    def test_tier_ordering(self):
        free = TIER_ARTWORK_LIMIT["free"]
        member = TIER_ARTWORK_LIMIT["member"]
        assert free < member
        assert TIER_ARTWORK_LIMIT["power"] is None
