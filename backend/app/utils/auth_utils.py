from datetime import UTC, datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from google.oauth2 import id_token
from google.auth.transport import requests
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import logging

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import User

logger = logging.getLogger(__name__)

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/google", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a new JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

def verify_google_token(token: str) -> Dict[str, Any]:
    """
    Verify a Google ID token
    Returns the decoded token claims if valid, otherwise raises HTTPException
    """
    try:
        # If no client ID is configured, we can't verify (except in dev maybe, but let's be strict)
        if not settings.google_client_id:
            logger.warning("GOOGLE_CLIENT_ID not configured. Using insecure verification for development.")
            # In a real app, you'd want to enforce this. 
            # For now, let's assume it's required.
            if settings.env != "dev":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Google Auth is not configured on the server."
                )

        idinfo = id_token.verify_oauth2_token(
            token, 
            requests.Request(), 
            settings.google_client_id
        )

        # ID token is valid. Get the user's Google Account ID from the decoded token.
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')

        return idinfo
    except Exception as e:
        logger.error(f"Google token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate Google token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """FastAPI dependency — returns the authenticated User or None (anonymous)."""
    if not token:
        return None

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    return db.query(User).filter(User.user_id == user_id).first()


def require_same_user(current_user: Optional[User], user_id: Optional[str]) -> None:
    """Raise 403 when a JWT is present but its subject doesn't match user_id.

    Skipped entirely when no JWT (anonymous mode) or no user_id in the request.
    """
    if current_user is None or not user_id:
        return
    if current_user.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: token does not match user_id",
        )
