from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.database.connection import get_db
from app.database.models import Tag, SavedArtwork, ArtworkTag
from app.config.settings import settings
from app.services.ai_service import AIServiceFactory
from app.models.artwork import AIProvider

router = APIRouter()
logger = logging.getLogger(__name__)


def get_ai_provider() -> AIProvider:
    """Get the default AI provider"""
    available_providers = AIServiceFactory.get_available_providers()
    if not available_providers:
        raise HTTPException(status_code=503, detail="No AI services available")

    try:
        default_provider = AIProvider(settings.ai_provider)
        if default_provider in available_providers:
            return default_provider
    except ValueError:
        pass

    return available_providers[0]


async def generate_tag_explanation_text(tag: str) -> str:
    """Generate a one-sentence explanation for a tag using LLM"""
    provider = get_ai_provider()
    ai_service = AIServiceFactory.get_service(provider)

    # Clean up the tag for the prompt
    clean_tag = tag.strip().lstrip('#').replace('-', ' ')

    prompt = f"""In one concise sentence (max 20 words), explain what "{clean_tag}" means in the context of art and art history.
Be informative but brief. Do not start with "It" or "{clean_tag} is". Just give the explanation directly.
Example: For "impressionism" -> "A 19th-century art movement emphasizing light, color, and everyday scenes through visible brushstrokes."
"""

    try:
        # Use the AI client's text-only method
        response = await ai_service.ai_client.call_text_only(
            prompt=prompt,
            max_tokens=100,
            temperature=0.7
        )
        return response.strip().strip('"')
    except Exception as e:
        logger.error(f"Failed to generate tag explanation: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate explanation")


def normalize_tag_name(tag: str) -> str:
    """Normalize tag name to lowercase with # prefix"""
    normalized = tag.strip().lower()
    if not normalized.startswith('#'):
        normalized = f'#{normalized}'
    return normalized


@router.get("/tag-explanation")
async def get_tag_explanation(
    tag: str = Query(..., description="The tag to get explanation for (e.g., '#impressionism')"),
    artwork_id: Optional[str] = Query(None, description="Optional artwork ID for context"),
    db: Session = Depends(get_db)
):
    """
    Get an LLM-generated one-sentence explanation for a tag.
    Returns cached explanation from DB if available, otherwise generates and caches.
    """
    normalized_tag = normalize_tag_name(tag)
    logger.info(f"Getting explanation for tag: {normalized_tag}")

    # Check DB for existing tag with explanation
    existing_tag = db.query(Tag).filter(Tag.name == normalized_tag).first()

    if existing_tag and existing_tag.explanation:
        logger.info(f"Found cached explanation for {normalized_tag}")
        return Response(content=existing_tag.explanation, media_type="text/plain")

    # Generate new explanation using LLM
    logger.info(f"Generating new explanation for {normalized_tag}")
    explanation = await generate_tag_explanation_text(normalized_tag)

    # Save to DB (create tag if doesn't exist, or update explanation)
    if existing_tag:
        existing_tag.explanation = explanation
    else:
        existing_tag = Tag(name=normalized_tag, explanation=explanation)
        db.add(existing_tag)

    try:
        db.commit()
        logger.info(f"Saved explanation for {normalized_tag} to DB")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save explanation to DB: {e}")
        # Still return the explanation even if saving failed

    return Response(content=explanation, media_type="text/plain")


@router.get("/tags", response_model=List[dict])
async def get_all_tags(
    db: Session = Depends(get_db)
):
    """Get all global tags"""
    tags = db.query(Tag).all()
    return [tag.to_dict() for tag in tags]


@router.get("/tags/{tag_name}", response_model=dict)
async def get_tag_by_name(
    tag_name: str,
    db: Session = Depends(get_db)
):
    """Get a tag by name"""
    normalized_tag = normalize_tag_name(tag_name)
    tag = db.query(Tag).filter(Tag.name == normalized_tag).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag.to_dict()


@router.post("/tags", response_model=dict)
async def create_or_get_tag(
    name: str = Query(..., description="Tag name (e.g., '#impressionism' or 'impressionism')"),
    db: Session = Depends(get_db)
):
    """Create a new global tag or return existing one"""
    normalized_name = normalize_tag_name(name)

    # Check if tag already exists
    existing_tag = db.query(Tag).filter(Tag.name == normalized_name).first()
    if existing_tag:
        return existing_tag.to_dict()

    new_tag = Tag(name=normalized_name)
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
    """Delete a tag (admin operation)"""
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


@router.get("/artworks/{artwork_id}/tags", response_model=List[dict])
async def get_artwork_tags(
    artwork_id: str,
    db: Session = Depends(get_db)
):
    """Get all tags for an artwork"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    return [tag.to_dict() for tag in artwork.artwork_tags]


@router.post("/artworks/{artwork_id}/tags/{tag_id}")
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


@router.delete("/artworks/{artwork_id}/tags/{tag_id}")
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
