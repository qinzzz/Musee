from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.services.taste_profile_service import (
    analyze_entity_dimensions,
    backfill_entity_dimensions,
    generate_taste_profile_snapshot,
    get_taste_profile_view,
)

router = APIRouter()


class GenerateTasteProfileRequest(BaseModel):
    user_id: str


@router.post("/admin/backfill-entity-dimensions")
async def backfill_dimensions_route(force: bool = False, db: Session = Depends(get_db)):
    return await backfill_entity_dimensions(db, force=force)


@router.post("/entities/{entity_id}/analyze-dimensions")
async def analyze_entity_dimensions_route(entity_id: str, db: Session = Depends(get_db)):
    return await analyze_entity_dimensions(db, entity_id)


@router.get("/taste-profile")
async def get_taste_profile(user_id: str, db: Session = Depends(get_db)):
    return get_taste_profile_view(user_id, db)


@router.post("/taste-profile/generate")
async def generate_taste_profile(
    request: GenerateTasteProfileRequest = Body(...),
    db: Session = Depends(get_db),
):
    return await generate_taste_profile_snapshot(request.user_id, db)
