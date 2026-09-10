from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.models import AuthSession, User
from app.utils.auth_utils import create_access_token


REFRESH_SUPERSEDED = "refresh_superseded"
CLIENT_PLATFORM_HEADER = "x-client-platform"
REFRESH_TOKEN_HEADER = "X-Refresh-Token"
MOBILE_CLIENT_PLATFORMS = frozenset({"ios", "android"})
logger = logging.getLogger(__name__)


def is_mobile_client(request: Request | None) -> bool:
    """Return whether the caller requested the native token transport."""
    if request is None:
        return False
    platform = request.headers.get(CLIENT_PLATFORM_HEADER, "").strip().lower()
    return platform in MOBILE_CLIENT_PLATFORMS


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def hash_refresh_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _new_refresh_credential(session_id: str) -> tuple[str, str]:
    secret = secrets.token_urlsafe(48)
    return f"{session_id}.{secret}", hash_refresh_secret(secret)


def _parse_refresh_credential(raw_token: str) -> tuple[str, str]:
    try:
        session_id, secret = raw_token.split(".", 1)
        uuid.UUID(session_id)
    except (ValueError, AttributeError):
        raise _refresh_error("invalid_refresh", "Your session is no longer valid.")
    return session_id, secret


def _refresh_error(code: str, message: str, *, http_status: int = status.HTTP_401_UNAUTHORIZED) -> HTTPException:
    return HTTPException(status_code=http_status, detail={"error_code": code, "message": message})


def refresh_cookie_secure() -> bool:
    if settings.refresh_cookie_secure is not None:
        return settings.refresh_cookie_secure
    return settings.env.lower() == "prod"


def validate_auth_origin(request: Request) -> None:
    """Reject browser cookie mutations from origins outside the app allowlist."""
    origin = request.headers.get("origin")
    if not origin:
        return
    allowed = {value.strip().rstrip("/") for value in settings.auth_allowed_origins.split(",") if value.strip()}
    if origin.rstrip("/") in allowed:
        return
    if settings.env.lower() != "prod" and re.fullmatch(
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
        origin,
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"error_code": "origin_not_allowed", "message": "This request origin is not allowed."},
    )


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_token,
        max_age=settings.refresh_session_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite=settings.refresh_cookie_samesite,
        path="/api/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite=settings.refresh_cookie_samesite,
        path="/api/auth",
    )


def create_refresh_session(db: Session, user_id: str) -> str:
    now = utc_now()
    auth_session = AuthSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token_family_id=str(uuid.uuid4()),
        current_token_hash="pending",
        rotation_version=0,
        created_at=now,
        last_used_at=now,
        absolute_expires_at=now + timedelta(days=settings.refresh_session_expire_days),
    )
    raw_token, token_hash = _new_refresh_credential(auth_session.id)
    auth_session.current_token_hash = token_hash
    db.add(auth_session)
    db.flush()
    return raw_token


def issue_login_session(
    db: Session,
    response: Response,
    user: User,
    *,
    include_refresh_token: bool = False,
) -> dict:
    raw_token = create_refresh_session(db, user.user_id)
    db.commit()
    db.refresh(user)
    logger.info("Created authentication session for user_id=%s", user.user_id)
    payload = {
        "access_token": create_access_token(data={"sub": user.user_id}),
        "expires_in": settings.access_token_expire_minutes * 60,
        "token_type": "bearer",
        "user": user.to_dict(),
    }
    # Login selects exactly one refresh-token transport: response body for a
    # native client, or an HttpOnly cookie for the browser.
    if include_refresh_token:
        payload["refresh_token"] = raw_token
    else:
        set_refresh_cookie(response, raw_token)
    return payload


@dataclass(frozen=True)
class RefreshResult:
    user: User
    raw_token: str
    auth_session_id: str


def rotate_refresh_session(db: Session, raw_token: str) -> RefreshResult:
    session_id, secret = _parse_refresh_credential(raw_token)
    presented_hash = hash_refresh_secret(secret)
    auth_session = (
        db.query(AuthSession)
        .filter(AuthSession.id == session_id)
        .with_for_update()
        .first()
    )
    if auth_session is None:
        raise _refresh_error("invalid_refresh", "Your session is no longer valid.")

    now = utc_now()
    if auth_session.revoked_at is not None:
        raise _refresh_error("refresh_revoked", "Your session was signed out.")
    if auth_session.absolute_expires_at <= now:
        auth_session.revoked_at = now
        auth_session.revocation_reason = "absolute_expired"
        db.commit()
        raise _refresh_error("refresh_expired", "Your session expired. Please sign in again.")
    if auth_session.last_used_at + timedelta(days=settings.refresh_session_inactivity_days) <= now:
        auth_session.revoked_at = now
        auth_session.revocation_reason = "inactive_expired"
        db.commit()
        raise _refresh_error("refresh_expired", "Your session expired. Please sign in again.")

    if hmac.compare_digest(auth_session.current_token_hash, presented_hash):
        next_raw_token, next_hash = _new_refresh_credential(auth_session.id)
        auth_session.previous_token_hash = auth_session.current_token_hash
        auth_session.previous_token_valid_until = now + timedelta(seconds=settings.refresh_rotation_grace_seconds)
        auth_session.current_token_hash = next_hash
        auth_session.rotation_version += 1
        auth_session.last_used_at = now
        user = db.query(User).filter(User.user_id == auth_session.user_id).first()
        if user is None:
            auth_session.revoked_at = now
            auth_session.revocation_reason = "user_missing"
            db.commit()
            raise _refresh_error("invalid_refresh", "Your account could not be found.")
        db.commit()
        logger.info(
            "Rotated authentication session id=%s version=%s",
            auth_session.id,
            auth_session.rotation_version,
        )
        return RefreshResult(user=user, raw_token=next_raw_token, auth_session_id=auth_session.id)

    is_recent_previous = (
        auth_session.previous_token_hash is not None
        and hmac.compare_digest(auth_session.previous_token_hash, presented_hash)
        and auth_session.previous_token_valid_until is not None
        and auth_session.previous_token_valid_until >= now
    )
    if is_recent_previous:
        raise _refresh_error(
            REFRESH_SUPERSEDED,
            "Another request already renewed this session.",
            http_status=status.HTTP_409_CONFLICT,
        )

    auth_session.revoked_at = now
    auth_session.revocation_reason = "token_reuse"
    db.commit()
    logger.warning("Revoked authentication session id=%s after refresh-token reuse", auth_session.id)
    raise _refresh_error("refresh_reuse", "This session was revoked. Please sign in again.")


def revoke_refresh_session(db: Session, raw_token: str | None, reason: str = "logout") -> None:
    if not raw_token:
        return
    try:
        session_id, _secret = _parse_refresh_credential(raw_token)
    except HTTPException:
        return
    auth_session = db.query(AuthSession).filter(AuthSession.id == session_id).with_for_update().first()
    if auth_session is not None and auth_session.revoked_at is None:
        auth_session.revoked_at = utc_now()
        auth_session.revocation_reason = reason
        logger.info("Revoked authentication session id=%s reason=%s", auth_session.id, reason)
    db.commit()


def revoke_user_refresh_sessions(db: Session, user_id: str, *, reason: str) -> None:
    """Revoke prior sessions within the caller's credential-update transaction.

    Existing access JWTs remain valid until their short expiry. The caller issues
    a fresh session only after this update so recovery itself stays signed in.
    """
    db.query(AuthSession).filter(
        AuthSession.user_id == user_id,
        AuthSession.revoked_at.is_(None),
    ).update({"revoked_at": utc_now(), "revocation_reason": reason}, synchronize_session="fetch")
