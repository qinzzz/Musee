from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel

from app.database.connection import get_db
from app.database.models import User

router = APIRouter()


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
    db: Session = Depends(get_db)
):
    """
    Get a user by user_id

    - **user_id**: User ID

    Returns the user object
    """
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
    db: Session = Depends(get_db)
):
    """
    Update a user's profile

    - **user_id**: User ID
    - **username**: Optional new username
    - **email**: Optional new email
    - **settings**: Optional new settings

    Returns the updated user object
    """
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
    db: Session = Depends(get_db)
):
    """
    Delete a user and all associated artworks

    - **user_id**: User ID

    Returns success message
    """
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
