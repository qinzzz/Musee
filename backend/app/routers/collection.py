from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload, load_only, with_loader_criteria
from typing import List, Optional
import logging

from app.database.connection import get_db
from app.database.models import Collection, SavedArtwork, User
from app.models.collection import CollectionCreate, CollectionUpdate
from app.services.authorization_service import (
    SAVE_ARTWORK,
    SEARCH_COLLECTION,
    RequestPrincipal,
    get_request_principal,
    require_capability,
    require_principal_for_user,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_collection_capability(
    principal: RequestPrincipal | None,
    user_id: str,
    capability: str,
) -> RequestPrincipal:
    resolved = require_principal_for_user(principal, user_id)
    require_capability(resolved, capability)
    return resolved


def _collection_with_artwork_ids_query(db: Session):
    return db.query(Collection).options(
        selectinload(Collection.artworks).load_only(SavedArtwork.id),
        with_loader_criteria(SavedArtwork, SavedArtwork.active_filter()),
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


def _get_owned_collection(db: Session, collection_id: str, user_id: str) -> Collection:
    collection = db.query(Collection).filter(Collection.id == collection_id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    if collection.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this collection")
    return collection


def _get_owned_artworks(db: Session, user_id: str, artwork_ids: List[str]) -> List[SavedArtwork]:
    if not artwork_ids:
        return []

    artworks = (
        db.query(SavedArtwork)
        .filter(
            SavedArtwork.id.in_(artwork_ids),
            SavedArtwork.user_id == user_id,
            SavedArtwork.active_filter(),
        )
        .all()
    )

    if len(artworks) != len(set(artwork_ids)):
        raise HTTPException(
            status_code=400,
            detail="One or more artworks do not belong to the user",
        )

    artworks_by_id = {artwork.id: artwork for artwork in artworks}
    return [artworks_by_id[artwork_id] for artwork_id in artwork_ids if artwork_id in artworks_by_id]


@router.post("/collections")
async def create_collection(
    request: CollectionCreate,
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    """Create a new collection"""
    _require_collection_capability(principal, request.user_id, SAVE_ARTWORK)
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
            db_collection.artworks = _get_owned_artworks(db, request.user_id, request.artwork_ids)

        db.commit()
        persisted = _collection_with_artwork_ids_query(db).filter(Collection.id == db_collection.id).first()
        return _serialize_collection(persisted)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create collection: {str(e)}")


@router.get("/collections")
def get_collections(
    user_id: str,
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    """Get all collections for a user"""
    _require_collection_capability(principal, user_id, SEARCH_COLLECTION)
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
async def get_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    """Get a specific collection with artworks"""
    try:
        collection = _collection_with_artwork_ids_query(db).filter(Collection.id == collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        _require_collection_capability(principal, collection.user_id, SEARCH_COLLECTION)
        return _serialize_collection(collection)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get collection: {str(e)}")


@router.put("/collections/{collection_id}")
async def update_collection(
    collection_id: str,
    request: CollectionUpdate,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    """Update collection details or artworks"""
    _require_collection_capability(principal, user_id, SAVE_ARTWORK)
    try:
        collection = _get_owned_collection(db, collection_id, user_id)

        if request.name is not None:
            collection.name = request.name
        if request.description is not None:
            collection.description = request.description
        
        if request.artwork_ids is not None:
            collection.artworks = _get_owned_artworks(db, user_id, request.artwork_ids)

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
async def delete_collection(
    collection_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    """Delete a collection"""
    _require_collection_capability(principal, user_id, SAVE_ARTWORK)
    try:
        collection = _get_owned_collection(db, collection_id, user_id)
        
        db.delete(collection)
        db.commit()
        return {"message": "Collection deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete collection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete collection: {str(e)}")
