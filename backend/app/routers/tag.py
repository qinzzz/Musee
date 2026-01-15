from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.database.connection import get_db
from app.database.models import Tag, SavedArtwork, ArtworkTag, User

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/tags", response_model=List[dict])
async def get_tags(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """Get all tags for a specific user"""
    tags = db.query(Tag).filter(Tag.user_id == user_id).all()
    return [tag.to_dict() for tag in tags]

@router.post("/tags", response_model=dict)
async def create_tag(
    name: str,
    user_id: str,
    db: Session = Depends(get_db)
):
    """Create a new tag for a user"""
    # Check if user exists
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if tag already exists for this user
    existing_tag = db.query(Tag).filter(Tag.name == name, Tag.user_id == user_id).first()
    if existing_tag:
        return existing_tag.to_dict()

    new_tag = Tag(name=name, user_id=user_id)
    db.add(new_tag)
    try:
        db.commit()
        db.refresh(new_tag)
        return new_tag.to_dict()
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating tag: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not create tag")

@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    db: Session = Depends(get_db)
):
    """Delete a tag"""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    db.delete(tag)
    try:
        db.commit()
        return {"message": "Tag deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting tag: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not delete tag")

@router.post("/saved-artworks/{artwork_id}/tags/{tag_id}")
async def add_tag_to_artwork(
    artwork_id: str,
    tag_id: str,
    db: Session = Depends(get_db)
):
    """Associate a tag with an artwork"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Check if association already exists
    existing = db.query(ArtworkTag).filter(
        ArtworkTag.artwork_id == artwork_id,
        ArtworkTag.tag_id == tag_id
    ).first()
    
    if existing:
        return {"message": "Tag already associated with artwork"}

    association = ArtworkTag(artwork_id=artwork_id, tag_id=tag_id)
    db.add(association)
    try:
        db.commit()
        return {"message": "Tag added to artwork"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding tag to artwork: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not add tag to artwork")

@router.delete("/saved-artworks/{artwork_id}/tags/{tag_id}")
async def remove_tag_from_artwork(
    artwork_id: str,
    tag_id: str,
    db: Session = Depends(get_db)
):
    """Remove a tag association from an artwork"""
    association = db.query(ArtworkTag).filter(
        ArtworkTag.artwork_id == artwork_id,
        ArtworkTag.tag_id == tag_id
    ).first()
    
    if not association:
        raise HTTPException(status_code=404, detail="Tag association not found")

    db.delete(association)
    try:
        db.commit()
        return {"message": "Tag removed from artwork"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing tag from artwork: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not remove tag from artwork")
