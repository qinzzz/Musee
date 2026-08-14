from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import logging

from app.config.plans import NEW_REGISTRATION_TIER
from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import User, UserCredential
from app.services.account_service import adopt_anonymous_account
from app.services.auth_session_service import (
    clear_refresh_cookie,
    issue_login_session,
    revoke_refresh_session,
    rotate_refresh_session,
    set_refresh_cookie,
    validate_auth_origin,
)
from app.utils.auth_utils import create_access_token, get_current_user, verify_google_token

router = APIRouter()
logger = logging.getLogger(__name__)

class GoogleLoginRequest(BaseModel):
    id_token: str
    anonymous_user_id: Optional[str] = None

@router.post("/auth/google")
async def google_login(
    request: GoogleLoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Login with Google ID Token and optionally migrate anonymous data
    """
    # 1. Verify Google Token
    idinfo = verify_google_token(request.id_token)
    google_id = idinfo['sub']
    email = idinfo.get('email')
    full_name = idinfo.get('name')
    picture = idinfo.get('picture')

    # 2. Find or create user
    user = db.query(User).filter(User.google_id == google_id).first()
    
    if not user and email:
        # Link by email: Google has verified this address, so whoever holds
        # the Google account owns it.
        user = db.query(User).filter(User.email == email).first()
        if user:
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
        # Create new user
        user = User(
            google_id=google_id,
            email=email,
            email_verified=True,  # Google verified it
            full_name=full_name,
            profile_picture_url=picture,
            username=email.split('@')[0] if email else None,
            tier=NEW_REGISTRATION_TIER,
        )
        db.add(user)
        db.flush() # Get user_id before commit
        logger.info(f"Created new Google user: {user.user_id}")
    else:
        # Update profile info if changed
        user.full_name = full_name
        user.profile_picture_url = picture
        logger.info(f"Logging in existing Google user: {user.user_id}")

    # 3. Adopt the device account's records, if one was provided
    if request.anonymous_user_id:
        adopt_anonymous_account(db, request.anonymous_user_id, user)

    return issue_login_session(db, response, user)


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
async def auth_session(current_user: Optional[User] = Depends(get_current_user)):
    if current_user is None:
        return {
            "state": "guest",
            "principal": None,
            "capabilities": {},
            "quotas": {},
            "plan": None,
        }
    return {
        "state": "authenticated",
        "principal": current_user.to_dict(),
        "capabilities": {},
        "quotas": {},
        "plan": current_user.tier,
    }
