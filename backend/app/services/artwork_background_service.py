from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, User as UserModel
from app.models.ai_job import AIJobType
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider

from app.config.plans import ARTWORK_UPLOADS, STORED_ARTWORKS
from app.services.quota_service import check_quota

logger = logging.getLogger(__name__)

ACTIVE_ARTWORK_TASKS: set[asyncio.Task] = set()


def track_artwork_task(task: asyncio.Task) -> asyncio.Task:
    ACTIVE_ARTWORK_TASKS.add(task)
    task.add_done_callback(ACTIVE_ARTWORK_TASKS.discard)
    return task


def check_artwork_quota(user_id: str, db: Session) -> None:
    """Guard for artwork-creating endpoints.

    Policy lives in app/config/plans.py; this just surfaces blocking
    decisions as the HTTP 402 contract the frontend already understands.
    """
    user = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    tier = (user.tier if user else None) or "free"

    for quota in (STORED_ARTWORKS, ARTWORK_UPLOADS):
        decision = check_quota(db, user_id, quota)
        if not decision.allowed:
            raise HTTPException(
                status_code=402,
                detail={
                    **decision.to_error_body(),
                    "code": "quota_exceeded",  # legacy alias of error_code
                    "tier": tier,
                    "message": _quota_message(quota, decision),
                },
            )


def _quota_message(quota: str, decision) -> str:
    limit = decision.status.limit
    if quota == ARTWORK_UPLOADS:
        return f"You have reached today's limit of {limit} artwork uploads."
    return f"You have reached the limit of {limit} stored artworks."


async def generate_fun_facts(
    artwork_id: str,
    artist_name: str,
    artwork_name: str,
    language: Optional[str],
) -> None:
    with SessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(
            SavedArtwork.id == artwork_id,
            SavedArtwork.active_filter(),
        ).first()
        if not artwork or artwork.insights:
            return

        artist = artwork.artist_name or artist_name or ""
        title = artwork.artwork_name or artwork_name or "Untitled"
        user_id = artwork.user_id

    if not artist or artist.lower() in ("unknown", "unknown artist", ""):
        return

    usage_id = None
    try:
        ai_service = AIServiceFactory.get_service(determine_ai_provider(None))
        usage_id = start_ai_usage(
            user_id=user_id,
            job_type=AIJobType.ARTWORK_FUN_FACTS,
            model=get_ai_model_name(ai_service),
            subject_type="artwork",
            subject_id=artwork_id,
        )
        fun_facts = await ai_service.get_fun_facts(
            artist_name=artist,
            artwork_name=title,
            language=language,
        )
        succeed_ai_usage(usage_id)
        with SessionLocal() as db:
            artwork = db.query(SavedArtwork).filter(
                SavedArtwork.id == artwork_id,
                SavedArtwork.active_filter(),
            ).first()
            if artwork and not artwork.insights:
                artwork.insights = fun_facts
                db.commit()
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.warning("Fun facts bg task failed for %s: %s", artwork_id, exc)
