from __future__ import annotations

from fastapi import APIRouter, Depends, Form
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.services.artwork_metadata_service import enrich_artwork_metadata_batch

router = APIRouter()


@router.post("/artworks/enrich-metadata")
async def enrich_artwork_metadata(
    user_id: str = Form(...),
    batch_size: int = Form(50),
    db: Session = Depends(get_db),
):
    return await enrich_artwork_metadata_batch(db, user_id, batch_size)
