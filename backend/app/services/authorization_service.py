from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Optional

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import GuestQuotaReservation, GuestWorkspace, Session as SessionModel, SessionEvent, User, UserCredential
from app.services.auth_session_service import refresh_cookie_secure, utc_now
from app.utils.auth_utils import get_current_user


CREATE_SESSION = "create_session"
SEND_MESSAGE = "send_message"
ANALYZE_ARTWORK = "analyze_artwork"
SAVE_ARTWORK = "save_artwork"
SEARCH_COLLECTION = "search_collection"
VIEW_PROFILE = "view_profile"

GUEST_SESSION_QUOTA = "guest_sessions"
GUEST_MESSAGE_QUOTA = "guest_messages"
GUEST_QUOTA_LIMITS = {
    GUEST_SESSION_QUOTA: 1,
    GUEST_MESSAGE_QUOTA: 1,
}

ALL_CAPABILITIES = (
    CREATE_SESSION,
    SEND_MESSAGE,
    ANALYZE_ARTWORK,
    SAVE_ARTWORK,
    SEARCH_COLLECTION,
    VIEW_PROFILE,
)


@dataclass(frozen=True)
class RequestPrincipal:
    state: Literal["guest", "authenticated"]
    user_id: str
    user: User
    guest_workspace: GuestWorkspace | None = None


def capabilities_for(state: str) -> dict[str, bool]:
    if state == "authenticated":
        return {capability: True for capability in ALL_CAPABILITIES}
    return {
        CREATE_SESSION: True,
        SEND_MESSAGE: True,
        ANALYZE_ARTWORK: True,
        SAVE_ARTWORK: False,
        SEARCH_COLLECTION: False,
        VIEW_PROFILE: False,
    }


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _new_credential(workspace_id: str) -> tuple[str, str]:
    secret = secrets.token_urlsafe(48)
    return f"{workspace_id}.{secret}", _hash_secret(secret)


def _parse_credential(raw_token: str) -> tuple[str, str] | None:
    try:
        workspace_id, secret = raw_token.split(".", 1)
        uuid.UUID(workspace_id)
    except (ValueError, AttributeError):
        return None
    return workspace_id, secret


def set_guest_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.guest_cookie_name,
        value=raw_token,
        max_age=settings.guest_workspace_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite=settings.refresh_cookie_samesite,
        path="/api",
    )


def clear_guest_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.guest_cookie_name,
        httponly=True,
        secure=refresh_cookie_secure(),
        samesite=settings.refresh_cookie_samesite,
        path="/api",
    )


def resolve_guest_workspace(db: Session, raw_token: str | None) -> GuestWorkspace | None:
    if not raw_token:
        return None
    parsed = _parse_credential(raw_token)
    if parsed is None:
        return None
    workspace_id, secret = parsed
    workspace = db.query(GuestWorkspace).filter(GuestWorkspace.id == workspace_id).first()
    now = utc_now()
    if (
        workspace is None
        or workspace.revoked_at is not None
        or workspace.absolute_expires_at <= now
        or not hmac.compare_digest(workspace.credential_hash, _hash_secret(secret))
    ):
        return None
    return workspace


def _is_unclaimed_guest_user(db: Session, user: User) -> bool:
    if user.google_id or user.email_verified:
        return False
    if db.query(UserCredential).filter(UserCredential.user_id == user.user_id).first():
        return False
    return db.query(GuestWorkspace).filter(GuestWorkspace.user_id == user.user_id).first() is None


def create_guest_workspace(
    db: Session,
    response: Response,
    legacy_user_id: str | None = None,
) -> GuestWorkspace:
    user = None
    if legacy_user_id:
        candidate = db.query(User).filter(User.user_id == legacy_user_id).first()
        if candidate is not None and _is_unclaimed_guest_user(db, candidate):
            user = candidate

    if user is None:
        user_id = f"guest_{uuid.uuid4()}"
        user = User(user_id=user_id, device_id=user_id, tier="free")
        db.add(user)
        db.flush()

    workspace = GuestWorkspace(
        id=str(uuid.uuid4()),
        user_id=user.user_id,
        credential_hash="pending",
        absolute_expires_at=utc_now() + timedelta(days=settings.guest_workspace_expire_days),
    )
    raw_token, credential_hash = _new_credential(workspace.id)
    workspace.credential_hash = credential_hash
    db.add(workspace)
    db.flush()

    # Existing device accounts are a one-time migration path. Seed their
    # reservations from canonical history so a browser with old data does not
    # receive an extra preview merely because the quota tables are new.
    existing_session = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == user.user_id)
        .order_by(SessionModel.created_at.asc())
        .first()
    )
    if existing_session is not None:
        db.add(GuestQuotaReservation(
            workspace_id=workspace.id,
            quota_key=GUEST_SESSION_QUOTA,
            idempotency_key=existing_session.id,
        ))
        existing_user_event = (
            db.query(SessionEvent)
            .join(SessionModel, SessionModel.id == SessionEvent.session_id)
            .filter(
                SessionModel.user_id == user.user_id,
                SessionEvent.role == "user",
            )
            .order_by(SessionEvent.created_at.asc(), SessionEvent.sequence_number.asc())
            .first()
        )
        if existing_user_event is not None:
            db.add(GuestQuotaReservation(
                workspace_id=workspace.id,
                quota_key=GUEST_MESSAGE_QUOTA,
                idempotency_key=existing_user_event.id,
            ))
    db.commit()
    db.refresh(workspace)
    set_guest_cookie(response, raw_token)
    return workspace


async def get_request_principal(
    current_user: Optional[User] = Depends(get_current_user),
    guest_token: Optional[str] = Cookie(default=None, alias=settings.guest_cookie_name),
    db: Session = Depends(get_db),
) -> RequestPrincipal | None:
    if current_user is not None:
        return RequestPrincipal(
            state="authenticated",
            user_id=current_user.user_id,
            user=current_user,
        )
    workspace = resolve_guest_workspace(db, guest_token)
    if workspace is None:
        return None
    user = db.query(User).filter(User.user_id == workspace.user_id).first()
    if user is None:
        return None
    return RequestPrincipal(
        state="guest",
        user_id=user.user_id,
        user=user,
        guest_workspace=workspace,
    )


def require_principal_for_user(
    principal: RequestPrincipal | None,
    claimed_user_id: str | None,
) -> RequestPrincipal:
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "guest_session_required",
                "message": "Start a guest session or sign in to continue.",
                "requires_authentication": False,
            },
        )
    if not claimed_user_id or claimed_user_id != principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "principal_mismatch",
                "message": "This request does not belong to the active account.",
            },
        )
    return principal


def require_capability(principal: RequestPrincipal, capability: str) -> None:
    if capabilities_for(principal.state).get(capability, False):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error_code": "capability_required",
            "message": "Sign in to use this feature.",
            "capability": capability,
            "requires_authentication": principal.state == "guest",
        },
    )


def require_session_principal(
    principal: RequestPrincipal | None,
    session_record: SessionModel,
) -> RequestPrincipal:
    return require_principal_for_user(principal, session_record.user_id)


def reserve_guest_quota(
    db: Session,
    principal: RequestPrincipal,
    quota_key: str,
    idempotency_key: str,
) -> bool:
    if principal.state != "guest":
        return False
    workspace = (
        db.query(GuestWorkspace)
        .filter(GuestWorkspace.id == principal.guest_workspace.id)
        .with_for_update()
        .one()
    )
    existing = db.query(GuestQuotaReservation).filter(
        GuestQuotaReservation.workspace_id == workspace.id,
        GuestQuotaReservation.quota_key == quota_key,
        GuestQuotaReservation.idempotency_key == idempotency_key,
    ).first()
    if existing is not None:
        return False

    used = db.query(GuestQuotaReservation).filter(
        GuestQuotaReservation.workspace_id == workspace.id,
        GuestQuotaReservation.quota_key == quota_key,
    ).count()
    limit = GUEST_QUOTA_LIMITS[quota_key]
    if used >= limit:
        capability = CREATE_SESSION if quota_key == GUEST_SESSION_QUOTA else SEND_MESSAGE
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "guest_quota_exhausted",
                "message": "The guest preview has reached its limit.",
                "capability": capability,
                "quota": quota_key,
                "limit": limit,
                "used": used,
                "requires_authentication": True,
            },
        )
    db.add(GuestQuotaReservation(
        workspace_id=workspace.id,
        quota_key=quota_key,
        idempotency_key=idempotency_key,
    ))
    db.flush()
    return True


def require_guest_quota_reservation(
    db: Session,
    principal: RequestPrincipal,
    quota_key: str,
    idempotency_key: str | None,
) -> None:
    if principal.state != "guest":
        return
    if not idempotency_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "capability_required",
                "message": "This guest request is not linked to an allowed message.",
                "capability": SEND_MESSAGE,
                "requires_authentication": True,
            },
        )
    exists = db.query(GuestQuotaReservation.id).filter(
        GuestQuotaReservation.workspace_id == principal.guest_workspace.id,
        GuestQuotaReservation.quota_key == quota_key,
        GuestQuotaReservation.idempotency_key == idempotency_key,
    ).first()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "guest_quota_exhausted",
                "message": "The guest preview has reached its limit.",
                "capability": SEND_MESSAGE,
                "quota": quota_key,
                "limit": GUEST_QUOTA_LIMITS[quota_key],
                "used": GUEST_QUOTA_LIMITS[quota_key],
                "requires_authentication": True,
            },
        )


def guest_quota_snapshot(db: Session, workspace: GuestWorkspace) -> dict[str, dict]:
    snapshot = {}
    for quota_key, limit in GUEST_QUOTA_LIMITS.items():
        used = db.query(GuestQuotaReservation).filter(
            GuestQuotaReservation.workspace_id == workspace.id,
            GuestQuotaReservation.quota_key == quota_key,
        ).count()
        snapshot[quota_key] = {
            "limit": limit,
            "used": used,
            "remaining": max(limit - used, 0),
            "period": "workspace",
        }
    return snapshot
