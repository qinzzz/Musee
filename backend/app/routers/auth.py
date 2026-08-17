from fastapi import APIRouter, Cookie, Depends, Form, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from urllib.parse import urlencode
import hmac
import logging

from app.config.plans import NEW_REGISTRATION_TIER
from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import User, UserCredential
from app.services.account_service import promote_guest_workspace
from app.services.auth_session_service import (
    clear_refresh_cookie,
    issue_login_session,
    revoke_refresh_session,
    rotate_refresh_session,
    set_refresh_cookie,
    validate_auth_origin,
)
from app.services.authorization_service import (
    capabilities_for,
    clear_guest_cookie,
    create_guest_workspace,
    guest_quota_snapshot,
    resolve_guest_workspace,
)
from app.services.quota_service import get_account_usage
from app.utils.auth_utils import create_access_token, get_current_user, verify_google_token

router = APIRouter()
logger = logging.getLogger(__name__)

class GoogleLoginRequest(BaseModel):
    id_token: str


GOOGLE_REDIRECT_SUCCESS = "success"
GOOGLE_REDIRECT_CREDENTIAL_ERROR = "credential_rejected"
GOOGLE_REDIRECT_CSRF_ERROR = "csrf_rejected"


def _google_redirect_url(*, welcome: Optional[str] = None, error: Optional[str] = None) -> str:
    query: dict[str, str] = {"google_auth": GOOGLE_REDIRECT_SUCCESS if not error else "error"}
    if welcome:
        query["welcome"] = welcome
    if error:
        query["error"] = error
    return f"{settings.app_base_url.rstrip('/')}/?{urlencode(query)}"


def _complete_google_login(
    id_token: str,
    response: Response,
    guest_token: Optional[str],
    db: Session,
) -> dict:
    """Verify a Google credential and create Musee's normal login session."""
    idinfo = verify_google_token(id_token)
    google_id = idinfo['sub']
    email = idinfo.get('email')
    full_name = idinfo.get('name')
    picture = idinfo.get('picture')

    user = db.query(User).filter(User.google_id == google_id).first()
    is_new_user = user is None

    if not user and email:
        # Link by email: Google has verified this address, so whoever holds
        # the Google account owns it.
        user = db.query(User).filter(User.email == email).first()
        if user:
            is_new_user = not user.email_verified
            user.google_id = google_id
            if not user.email_verified:
                # The row was unclaimed territory: a password signup that never
                # proved the inbox. Google proof wins — drop the unproven
                # credential so a squatter can't retain a way in.
                deleted = (
                    db.query(UserCredential)
                    .filter(UserCredential.user_id == user.user_id)
                    .delete()
                )
                if deleted:
                    logger.info(f"Removed unverified password credential from {user.user_id} on Google link")
            user.email_verified = True
            logger.info(f"Linked existing user {user.user_id} by email to google_id {google_id}")

    if not user:
        user = User(
            google_id=google_id,
            email=email,
            email_verified=True,
            full_name=full_name,
            profile_picture_url=picture,
            username=email.split('@')[0] if email else None,
            tier=NEW_REGISTRATION_TIER,
        )
        db.add(user)
        db.flush()
        logger.info(f"Created new Google user: {user.user_id}")
    else:
        user.full_name = full_name
        user.profile_picture_url = picture
        logger.info(f"Logging in existing Google user: {user.user_id}")

    guest_promoted = promote_guest_workspace(db, guest_token, user)
    if guest_token:
        clear_guest_cookie(response)

    result = issue_login_session(db, response, user)
    result["guest_promoted"] = guest_promoted
    result["is_new_user"] = is_new_user
    return result

@router.post("/auth/google")
async def google_login(
    request: GoogleLoginRequest,
    response: Response,
    http_request: Request,
    guest_token: Optional[str] = Cookie(default=None, alias=settings.guest_cookie_name),
    db: Session = Depends(get_db)
):
    """
    Login with Google and promote only a cookie-authenticated guest workspace.
    """
    validate_auth_origin(http_request)
    return _complete_google_login(request.id_token, response, guest_token, db)


@router.post("/auth/google/redirect")
async def google_login_redirect(
    credential: str = Form(...),
    csrf_form_token: str = Form(..., alias="g_csrf_token"),
    csrf_cookie_token: Optional[str] = Cookie(default=None, alias="g_csrf_token"),
    guest_token: Optional[str] = Cookie(default=None, alias=settings.guest_cookie_name),
    db: Session = Depends(get_db),
):
    """Complete Google Identity Services' full-page mobile redirect flow."""
    if (
        not csrf_cookie_token
        or not csrf_form_token
        or not hmac.compare_digest(csrf_cookie_token, csrf_form_token)
    ):
        logger.warning("Rejected Google redirect because its CSRF tokens did not match")
        return RedirectResponse(
            _google_redirect_url(error=GOOGLE_REDIRECT_CSRF_ERROR),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    redirect_response = RedirectResponse(
        _google_redirect_url(),
        status_code=status.HTTP_303_SEE_OTHER,
    )
    try:
        result = _complete_google_login(credential, redirect_response, guest_token, db)
    except HTTPException as exc:
        db.rollback()
        logger.warning("Google redirect credential verification failed with status %s", exc.status_code)
        return RedirectResponse(
            _google_redirect_url(error=GOOGLE_REDIRECT_CREDENTIAL_ERROR),
            status_code=status.HTTP_303_SEE_OTHER,
        )

    redirect_response.headers["location"] = _google_redirect_url(
        welcome="new" if result["is_new_user"] else "returning",
    )
    return redirect_response


@router.post("/auth/refresh")
async def refresh_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None, alias=settings.refresh_cookie_name),
):
    validate_auth_origin(request)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error_code": "refresh_missing", "message": "No active sign-in session."},
        )
    result = rotate_refresh_session(db, refresh_token)
    set_refresh_cookie(response, result.raw_token)
    return {
        "access_token": create_access_token(data={"sub": result.user.user_id}),
        "expires_in": settings.access_token_expire_minutes * 60,
        "token_type": "bearer",
    }


@router.post("/auth/logout")
async def logout_session(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None, alias=settings.refresh_cookie_name),
):
    validate_auth_origin(request)
    revoke_refresh_session(db, refresh_token)
    clear_refresh_cookie(response)
    return {"ok": True}


@router.get("/auth/session")
async def auth_session(
    request: Request,
    response: Response,
    guest_user_id: Optional[str] = Query(default=None),
    current_user: Optional[User] = Depends(get_current_user),
    guest_token: Optional[str] = Cookie(default=None, alias=settings.guest_cookie_name),
    db: Session = Depends(get_db),
):
    validate_auth_origin(request)
    if current_user is None:
        workspace = resolve_guest_workspace(db, guest_token)
        if workspace is None:
            workspace = create_guest_workspace(db, response, legacy_user_id=guest_user_id)
        return {
            "state": "guest",
            "principal": {"kind": "guest", "user_id": workspace.user_id},
            "capabilities": capabilities_for("guest"),
            "quotas": guest_quota_snapshot(db, workspace),
            "plan": "guest",
        }
    usage = get_account_usage(db, current_user.user_id)
    return {
        "state": "authenticated",
        "principal": {"kind": "authenticated", **current_user.to_dict()},
        "capabilities": capabilities_for("authenticated"),
        "quotas": usage["quotas"],
        "plan": current_user.tier,
    }
