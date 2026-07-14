from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import logging

from app.database.connection import get_db
from app.database.models import User, UserCredential
from app.services.account_service import adopt_anonymous_account
from app.utils.auth_utils import verify_google_token, create_access_token

router = APIRouter()
logger = logging.getLogger(__name__)

class GoogleLoginRequest(BaseModel):
    id_token: str
    anonymous_user_id: Optional[str] = None

@router.post("/auth/google")
async def google_login(
    request: GoogleLoginRequest,
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
            username=email.split('@')[0] if email else None
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

    db.commit()
    db.refresh(user)

    # 4. Generate JWT
    access_token = create_access_token(data={"sub": user.user_id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }
