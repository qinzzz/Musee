from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import logging

from app.database.connection import get_db
from app.database.models import User, SavedArtwork, Collection, Session as UserSession
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
        # Fallback: find by email (might have been created via some other means or anonymous email entry)
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
            logger.info(f"Linked existing user {user.user_id} by email to google_id {google_id}")

    if not user:
        # Create new user
        user = User(
            google_id=google_id,
            email=email,
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

    # 3. Handle Migration if anonymous_user_id provided
    if request.anonymous_user_id and request.anonymous_user_id != user.user_id:
        anon_user = db.query(User).filter(User.user_id == request.anonymous_user_id).first()
        if anon_user and not anon_user.google_id:
            logger.info(f"Migrating data from anonymous user {request.anonymous_user_id} to {user.user_id}")
            
            # Update Related Data
            db.query(SavedArtwork).filter(SavedArtwork.user_id == anon_user.user_id).update({SavedArtwork.user_id: user.user_id})
            db.query(Collection).filter(Collection.user_id == anon_user.user_id).update({Collection.user_id: user.user_id})
            db.query(UserSession).filter(UserSession.user_id == anon_user.user_id).update({UserSession.user_id: user.user_id})
            
            # Delete anonymous user to clean up
            db.delete(anon_user)
            logger.info(f"Migration complete. Deleted anonymous user {request.anonymous_user_id}")

    db.commit()
    db.refresh(user)

    # 4. Generate JWT
    access_token = create_access_token(data={"sub": user.user_id})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }
