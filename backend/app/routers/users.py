from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.database.connection import get_db
from app.database.models import User, SavedArtwork
from app.utils.auth_utils import get_current_user, require_same_user

router = APIRouter()

TIER_ARTWORK_LIMIT: dict[str, int | None] = {
    "free":   20,
    "member": 200,
    "power":  None,
}


class CreateUserRequest(BaseModel):
    """Request model for creating a user"""
    device_id: str
    username: Optional[str] = None
    email: Optional[str] = None
    settings: Optional[dict] = None


class UpdateUserRequest(BaseModel):
    """Request model for updating a user"""
    username: Optional[str] = None
    email: Optional[str] = None
    settings: Optional[dict] = None


@router.post("/users")
async def create_or_get_user(
    request: CreateUserRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new user or get existing user by device_id

    This endpoint is idempotent - if a user with the device_id already exists,
    it returns that user instead of creating a duplicate.

    - **device_id**: Unique device identifier from Keychain
    - **username**: Optional username
    - **email**: Optional email
    - **settings**: Optional user settings JSON

    Returns the user object
    """
    try:
        # Check if user already exists with this device_id
        existing_user = db.query(User).filter(User.device_id == request.device_id).first()

        if existing_user:
            return existing_user.to_dict()

        # Create new user
        new_user = User(
            device_id=request.device_id,
            username=request.username,
            email=request.email,
            settings=request.settings
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return new_user.to_dict()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create user: {str(e)}"
        )


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Get a user by user_id

    - **user_id**: User ID

    Returns the user object
    """
    require_same_user(current_user, user_id)
    try:
        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return user.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve user: {str(e)}"
        )


@router.get("/users/by-device/{device_id}")
async def get_user_by_device(
    device_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a user by device_id (read-only, no side effects)

    - **device_id**: Device ID from Keychain

    Returns the user object or 404 if not found
    """
    user = db.query(User).filter(User.device_id == device_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user.to_dict()


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    request: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Update a user's profile

    - **user_id**: User ID
    - **username**: Optional new username
    - **email**: Optional new email
    - **settings**: Optional new settings

    Returns the updated user object
    """
    require_same_user(current_user, user_id)
    try:
        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Update fields if provided
        if request.username is not None:
            user.username = request.username

        if request.email is not None:
            user.email = request.email

        if request.settings is not None:
            user.settings = request.settings

        db.commit()
        db.refresh(user)

        return user.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update user: {str(e)}"
        )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Delete a user and all associated artworks

    - **user_id**: User ID

    Returns success message
    """
    require_same_user(current_user, user_id)
    try:
        user = db.query(User).filter(User.user_id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        db.delete(user)
        db.commit()

        return {"message": "User deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete user: {str(e)}"
        )


@router.get("/users/{user_id}/quota")
async def get_user_quota(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Return tier, artwork usage, and limit for the given user."""
    require_same_user(current_user, user_id)
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tier = user.tier or "free"
    limit = TIER_ARTWORK_LIMIT.get(tier, TIER_ARTWORK_LIMIT["free"])
    used = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).count()
    return {"tier": tier, "used": used, "limit": limit}


class SetTierRequest(BaseModel):
    user_id: str
    tier: str
    admin_secret: str


@router.post("/admin/set-tier")
async def admin_set_tier(request: SetTierRequest, db: Session = Depends(get_db)):
    """Manually set a user's tier (requires admin_secret from env)."""
    import os
    expected = os.environ.get("ADMIN_SECRET", "")
    if not expected or request.admin_secret != expected:
        raise HTTPException(status_code=403, detail="Forbidden")
    if request.tier not in TIER_ARTWORK_LIMIT:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {list(TIER_ARTWORK_LIMIT.keys())}")
    user = db.query(User).filter(User.user_id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.tier = request.tier
    db.commit()
    return {"user_id": user.user_id, "tier": user.tier}
