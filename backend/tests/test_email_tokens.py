"""Tests for the email-token machinery — the security-critical module.

Every email-auth flow depends on the guarantees proven here: hash-at-rest,
expiry, purpose matching, single use, and no-oracle failures.
"""
from datetime import datetime, timedelta

import pytest

from app.database.models import EmailToken, User
from app.services.email_token_service import (
    PURPOSE_RESET_PASSWORD,
    PURPOSE_VERIFY_EMAIL,
    consume_email_token,
    create_email_token,
)


@pytest.fixture
def user(db):
    u = User(user_id="u-tokens", device_id="u-tokens", tier="free")
    db.add(u)
    db.commit()
    return u


def test_raw_token_is_never_stored(db, user):
    raw = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL)
    rows = db.query(EmailToken).all()
    assert len(rows) == 1
    assert rows[0].token_hash != raw
    assert raw not in rows[0].token_hash
    assert len(rows[0].token_hash) == 64  # sha256 hex


def test_consume_succeeds_exactly_once(db, user):
    raw = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL)

    token = consume_email_token(db, raw_token=raw, purpose=PURPOSE_VERIFY_EMAIL)
    assert token is not None
    assert token.user_id == user.user_id
    assert token.used_at is not None

    # Replay: the same link can never work twice.
    assert consume_email_token(db, raw_token=raw, purpose=PURPOSE_VERIFY_EMAIL) is None


def test_wrong_purpose_fails(db, user):
    raw = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_RESET_PASSWORD)
    assert consume_email_token(db, raw_token=raw, purpose=PURPOSE_VERIFY_EMAIL) is None
    # And the failed attempt must not have burned the token.
    assert consume_email_token(db, raw_token=raw, purpose=PURPOSE_RESET_PASSWORD) is not None


def test_expired_token_fails(db, user):
    raw = create_email_token(
        db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL, ttl=timedelta(seconds=-1),
    )
    assert consume_email_token(db, raw_token=raw, purpose=PURPOSE_VERIFY_EMAIL) is None


def test_unknown_and_empty_tokens_fail_silently(db, user):
    assert consume_email_token(db, raw_token="not-a-real-token", purpose=PURPOSE_VERIFY_EMAIL) is None
    assert consume_email_token(db, raw_token="", purpose=PURPOSE_VERIFY_EMAIL) is None


def test_new_token_invalidates_previous_unused_one(db, user):
    first = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL)
    second = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL)

    # Only the most recently sent link works.
    assert consume_email_token(db, raw_token=first, purpose=PURPOSE_VERIFY_EMAIL) is None
    assert consume_email_token(db, raw_token=second, purpose=PURPOSE_VERIFY_EMAIL) is not None


def test_reissue_does_not_touch_other_purposes_or_users(db, user):
    other = User(user_id="u-other", device_id="u-other", tier="free")
    db.add(other)
    db.commit()

    reset_raw = create_email_token(db, user_id=user.user_id, purpose=PURPOSE_RESET_PASSWORD)
    other_raw = create_email_token(db, user_id=other.user_id, purpose=PURPOSE_VERIFY_EMAIL)
    create_email_token(db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL)

    assert consume_email_token(db, raw_token=reset_raw, purpose=PURPOSE_RESET_PASSWORD) is not None
    assert consume_email_token(db, raw_token=other_raw, purpose=PURPOSE_VERIFY_EMAIL) is not None


def test_anonymous_user_id_rides_the_token(db, user):
    raw = create_email_token(
        db, user_id=user.user_id, purpose=PURPOSE_VERIFY_EMAIL, anonymous_user_id="device-123",
    )
    token = consume_email_token(db, raw_token=raw, purpose=PURPOSE_VERIFY_EMAIL)
    assert token.anonymous_user_id == "device-123"


def test_unknown_purpose_rejected_at_creation(db, user):
    with pytest.raises(ValueError):
        create_email_token(db, user_id=user.user_id, purpose="steal_account")
