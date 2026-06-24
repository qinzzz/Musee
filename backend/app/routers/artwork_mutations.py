from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.artwork import UpdateArtworkClassificationRequest, UpdateArtworkRequest
from app.services.artwork_mutation_service import (
    get_or_create_artwork_insights_payload,
    update_artwork_classification_record,
    update_artwork_record,
)

router = APIRouter()


@router.put("/artworks/{artwork_id}")
async def update_artwork(
    artwork_id: str,
    request: UpdateArtworkRequest,
    db: Session = Depends(get_db),
):
    try:
        return update_artwork_record(db, artwork_id, request)
    except Exception:
        db.rollback()
        raise


@router.patch("/artworks/{artwork_id}/classification")
async def update_artwork_classification(
    artwork_id: str,
    request: UpdateArtworkClassificationRequest,
    db: Session = Depends(get_db),
):
    return update_artwork_classification_record(db, artwork_id, request)


@router.post("/artworks/{artwork_id}/insights")
async def get_or_create_artwork_insights(
    artwork_id: str,
    language: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return await get_or_create_artwork_insights_payload(db, artwork_id, language)
