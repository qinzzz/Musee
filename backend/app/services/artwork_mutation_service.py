from __future__ import annotations

from datetime import UTC, datetime
import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import SavedArtwork, Session as SessionModel
from app.models.artwork import UpdateArtworkClassificationRequest, UpdateArtworkRequest
from app.services.ai_service import AIServiceFactory
from app.services.artwork_analysis_service import batch_link_tags, determine_ai_provider
from app.services.session_service import get_artwork_session_ids, refresh_session_title
from app.services.taste_profile_service import mark_taste_profile_outdated

logger = logging.getLogger(__name__)

CLASSIFICATION_VALUES = {"unsorted", "love", "respect", "not_for_me"}


def update_artwork_record(
    db: Session,
    artwork_id: str,
    request: UpdateArtworkRequest,
) -> dict:
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    if request.artist_name is not None:
        artwork.artist_name = request.artist_name.strip()
    if request.artwork_name is not None:
        artwork.artwork_name = request.artwork_name.strip()
    if request.summary is not None:
        artwork.summary = request.summary
    if request.analysis is not None:
        artwork.analysis = request.analysis
    if request.params is not None:
        artwork.params = request.params

    if request.date is not None or request.medium is not None:
        current_params = dict(artwork.params) if isinstance(artwork.params, dict) else {}
        if request.date is not None:
            current_params["date"] = request.date
        if request.medium is not None:
            current_params["medium"] = request.medium
        artwork.params = current_params

    if request.tags is not None:
        batch_link_tags(db, artwork, request.tags)

    artwork.is_recognized = 1 if (
        artwork.artist_name.lower() != "unknown artist"
        and artwork.artwork_name.lower() != "unknown"
    ) else 0

    for linked_session_id in get_artwork_session_ids(db, artwork_id):
        linked_session = db.query(SessionModel).filter(SessionModel.id == linked_session_id).first()
        refresh_session_title(db, linked_session)

    db.commit()
    db.refresh(artwork)
    return artwork.to_dict()


def update_artwork_classification_record(
    db: Session,
    artwork_id: str,
    request: UpdateArtworkClassificationRequest,
) -> dict:
    classification = (request.classification or "").strip().lower()
    if classification not in CLASSIFICATION_VALUES:
        raise HTTPException(status_code=400, detail="Invalid classification")

    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    previous = artwork.classification or "unsorted"
    artwork.classification = classification
    artwork.classification_updated_at = datetime.now(UTC)
    invalidated = previous != classification and mark_taste_profile_outdated(artwork.user_id, db)
    db.commit()

    return {
        "artwork_id": artwork.id,
        "classification": artwork.classification,
        "profile_invalidated": invalidated,
    }


async def get_or_create_artwork_insights_payload(
    db: Session,
    artwork_id: str,
    language: Optional[str],
) -> dict:
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    if artwork.insights:
        return {"insights": artwork.insights}

    artist = artwork.artist_name or ""
    if not artist or artist.lower() in ("unknown", "unknown artist", ""):
        return {"insights": []}

    ai_provider = determine_ai_provider(None)
    ai_service = AIServiceFactory.get_service(ai_provider)
    try:
        points = await ai_service.get_insights(
            artist_name=artist,
            artwork_name=artwork.artwork_name or "Untitled",
            language=language,
        )
    except Exception as exc:
        logger.exception("Insights computation failed for %s", artwork_id)
        raise HTTPException(status_code=500, detail=str(exc))

    artwork.insights = points
    db.commit()
    return {"insights": points}
