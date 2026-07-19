from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.services.artwork_analysis_task_service import backfill_artwork_analyses
from app.services.taste_profile_service import (
    generate_taste_profile_snapshot,
    get_taste_profile_view,
)

router = APIRouter()


class GenerateTasteProfileRequest(BaseModel):
    user_id: str


@router.post("/admin/backfill-artwork-analyses")
async def backfill_artwork_analyses_route(
    limit: int | None = None,
    force: bool = False,
    db: Session = Depends(get_db),
):
    return await backfill_artwork_analyses(db, limit=limit, force=force)


@router.get("/taste-profile")
async def get_taste_profile(user_id: str, db: Session = Depends(get_db)):
    return get_taste_profile_view(user_id, db)


@router.post("/taste-profile/generate")
async def generate_taste_profile(
    request: GenerateTasteProfileRequest = Body(...),
    db: Session = Depends(get_db),
):
    return await generate_taste_profile_snapshot(request.user_id, db)
