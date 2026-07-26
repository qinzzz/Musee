from __future__ import annotations

from datetime import date
import os
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.services.journal_service import generate_daily_journal, list_user_journals

router = APIRouter()


class GenerateJournalRequest(BaseModel):
    user_id: str = Field(min_length=1)
    local_date: date
    timezone: str = Field(min_length=1)
    language: Optional[str] = None
    force_regenerate: bool = False
    admin_secret: str = Field(min_length=1)


@router.get("/journals")
async def list_journals(
    user_id: str,
    db: Session = Depends(get_db),
):
    return {"items": list_user_journals(db, user_id=user_id)}


@router.post("/admin/journals/generate")
async def generate_journal(
    request: GenerateJournalRequest = Body(...),
    db: Session = Depends(get_db),
):
    expected_secret = os.environ.get("ADMIN_SECRET", "")
    if not expected_secret or request.admin_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    journal, regenerated = await generate_daily_journal(
        db,
        user_id=request.user_id,
        local_date=request.local_date,
        timezone_name=request.timezone,
        configured_language=request.language,
        force_regenerate=request.force_regenerate,
    )
    return {
        "journal": journal.to_dict(include_evidence=True),
        "regenerated": regenerated,
    }
