from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload, load_only
from typing import List, Optional
import logging

from app.database.connection import get_db
from app.database.models import Collection, SavedArtwork, User
from app.models.collection import CollectionCreate, CollectionUpdate

router = APIRouter()
logger = logging.getLogger(__name__)


def _collection_with_artwork_ids_query(db: Session):
    return db.query(Collection).options(
        selectinload(Collection.artworks).load_only(SavedArtwork.id)
    )


def _serialize_collection(collection: Collection) -> dict:
    artwork_ids = [artwork.id for artwork in collection.artworks] if collection.artworks else []
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "user_id": collection.user_id,
        "artwork_count": len(artwork_ids),
        "artwork_ids": artwork_ids,
        "artworks": [{"id": artwork_id} for artwork_id in artwork_ids],
        "created_at": collection.created_at.isoformat() if collection.created_at else None,
        "updated_at": collection.updated_at.isoformat() if collection.updated_at else None,
    }


@router.post("/collections")
async def create_collection(request: CollectionCreate, db: Session = Depends(get_db)):
    """Create a new collection"""
    try:
        # Verify user exists
        user = db.query(User).filter(User.user_id == request.user_id).first()
        if not user:
            # For backwards compatibility, maybe the user hasn't been created yet?
            # But normally user should exist.
            logger.warning(f"User {request.user_id} not found when creating collection")
        
        db_collection = Collection(
            name=request.name,
            description=request.description,
            user_id=request.user_id
        )
        db.add(db_collection)
        db.flush()

        if request.artwork_ids:
            artworks = db.query(SavedArtwork).filter(SavedArtwork.id.in_(request.artwork_ids)).all()
            db_collection.artworks = artworks

        db.commit()
        persisted = _collection_with_artwork_ids_query(db).filter(Collection.id == db_collection.id).first()
        return _serialize_collection(persisted)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create collection: {str(e)}")


@router.get("/collections")
async def get_collections(user_id: str, db: Session = Depends(get_db)):
    """Get all collections for a user"""
    try:
        collections = (
            _collection_with_artwork_ids_query(db)
            .filter(Collection.user_id == user_id)
            .order_by(Collection.created_at.desc())
            .all()
        )
        
        logger.info(f"Retrieved {len(collections)} collections for user {user_id}")
        return [_serialize_collection(collection) for collection in collections]
    except Exception as e:
        logger.error(f"Failed to get collections: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get collections: {str(e)}")


@router.get("/collections/{collection_id}")
async def get_collection(collection_id: str, db: Session = Depends(get_db)):
    """Get a specific collection with artworks"""
    try:
        collection = _collection_with_artwork_ids_query(db).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        return _serialize_collection(collection)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get collection: {str(e)}")


@router.put("/collections/{collection_id}")
async def update_collection(collection_id: str, request: CollectionUpdate, db: Session = Depends(get_db)):
    """Update collection details or artworks"""
    try:
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

        if request.name is not None:
            collection.name = request.name
        if request.description is not None:
            collection.description = request.description
        
        if request.artwork_ids is not None:
            artworks = db.query(SavedArtwork).filter(SavedArtwork.id.in_(request.artwork_ids)).all()
            collection.artworks = artworks

        db.commit()
        persisted = _collection_with_artwork_ids_query(db).filter(Collection.id == collection.id).first()
        return _serialize_collection(persisted)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update collection: {str(e)}")


@router.delete("/collections/{collection_id}")
async def delete_collection(collection_id: str, db: Session = Depends(get_db)):
    """Delete a collection"""
    try:
        collection = db.query(Collection).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        
        db.delete(collection)
        db.commit()
        return {"message": "Collection deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete collection: {str(e)}")
