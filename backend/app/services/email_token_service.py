"""Single-use emailed token machinery.

Every email-auth flow (verify signup, reset password, add a password to a
Google-first account) reduces to the same two operations here. The
discipline that makes emailed links safe lives in this module and nowhere
else: tokens are stored only as SHA-256 hashes, expire, match one purpose,
and can be consumed exactly once (atomically).
"""
import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.database.models import EmailToken

logger = logging.getLogger(__name__)

PURPOSE_VERIFY_EMAIL = "verify_email"
PURPOSE_RESET_PASSWORD = "reset_password"

DEFAULT_TTL = {
    PURPOSE_VERIFY_EMAIL: timedelta(hours=24),
    PURPOSE_RESET_PASSWORD: timedelta(minutes=30),
}


def _utcnow() -> datetime:
    # Naive UTC, matching the schema's timezone-naive DateTime columns.
    return datetime.now(UTC).replace(tzinfo=None)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_email_token(
    db: Session,
    *,
    user_id: str,
    purpose: str,
    anonymous_user_id: Optional[str] = None,
    ttl: Optional[timedelta] = None,
) -> str:
    """Mint a token for the given user and purpose; returns the raw token.

    The raw value goes into the emailed link and is never persisted.
    Any previous unused tokens for the same user and purpose are invalidated,
    so only the most recently sent link works.
    """
    if purpose not in DEFAULT_TTL:
        raise ValueError(f"Unknown email token purpose: {purpose}")

    now = _utcnow()
    db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user_id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )

    raw_token = secrets.token_urlsafe(48)
    db.add(EmailToken(
        user_id=user_id,
        purpose=purpose,
        token_hash=_hash_token(raw_token),
        anonymous_user_id=anonymous_user_id,
        expires_at=now + (ttl or DEFAULT_TTL[purpose]),
    ))
    db.commit()
    return raw_token


def consume_email_token(db: Session, *, raw_token: str, purpose: str) -> Optional[EmailToken]:
    """Redeem a token: returns its row exactly once, or None.

    None means invalid for any reason — unknown, wrong purpose, expired, or
    already used. Callers must not distinguish (no oracle for attackers).
    The used_at stamp happens in a single UPDATE ... WHERE used_at IS NULL,
    so two concurrent redemptions cannot both succeed.
    """
    if not raw_token:
        return None

    now = _utcnow()
    result = db.execute(
        update(EmailToken)
        .where(
            EmailToken.token_hash == _hash_token(raw_token),
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
            EmailToken.expires_at > now,
        )
        .values(used_at=now)
    )
    if result.rowcount != 1:
        db.rollback()
        return None
    db.commit()

    return db.query(EmailToken).filter(
        EmailToken.token_hash == _hash_token(raw_token),
    ).first()
