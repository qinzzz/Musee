from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import json
import logging
import re
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.models import ArtworkEntity, SavedArtwork, User as UserModel
from app.services.ai_service import AIServiceFactory
from app.services.ai_usage_service import fail_ai_usage, get_ai_model_name, start_ai_usage, succeed_ai_usage
from app.services.artwork_analysis_service import determine_ai_provider
from app.services.openai_api_client import OpenAIAPIClient

from app.config.plans import ARTWORK_UPLOADS, STORED_ARTWORKS
from app.services.quota_service import check_quota

logger = logging.getLogger(__name__)

ACTIVE_ARTWORK_TASKS: set[asyncio.Task] = set()



DIM_ANALYSIS_PROMPT = """\
You are an art analysis assistant. Given an artwork's metadata, score it on five taste dimensions.

Artwork: "{title}" by {artist} ({date_hint})
Medium: {medium_hint}
Description: {description_hint}

For each dimension output exactly -1, 0, or 1:
  -1 = clearly left pole
   0 = neutral / both sides / cannot determine
   1 = clearly right pole

Dimensions:
- dim_figurative_abstract: Is the image recognisably depicting real things? (-1=figurative, 1=abstract)
- dim_emotive_conceptual: Is the primary appeal emotion or intellect/idea? (-1=emotive, 1=conceptual)
- dim_serene_intense: Is the visual mood calm or tense/dramatic? (-1=serene, 1=intense)
- dim_classical_avantgarde: Does it follow tradition or break from it? (-1=classical, 1=avant-garde)
- dim_playful_serious: Is the tone light/playful or heavy/serious? (-1=playful, 1=serious)

Respond with ONLY valid JSON, no explanation:
{{"dim_figurative_abstract": <int>, "dim_emotive_conceptual": <int>, "dim_serene_intense": <int>, "dim_classical_avantgarde": <int>, "dim_playful_serious": <int>}}
"""


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


async def do_dimension_analysis(entity_id: str) -> None:
    db = SessionLocal()
    usage_id: Optional[str] = None
    try:
        entity = db.query(ArtworkEntity).filter(ArtworkEntity.id == entity_id).first()
        if not entity or entity.dim_status == "done":
            return

        prompt = DIM_ANALYSIS_PROMPT.format(
            title=entity.display_title,
            artist=entity.display_artist,
            date_hint="unknown date",
            medium_hint="unknown medium",
            description_hint="No additional description available.",
        )
        entity.dim_status = "processing"
        db.commit()
        try:
            usage_id = start_ai_usage(
                user_id=None,
                job_type="dimension_enrichment",
                model="gpt-5.4-mini",
                subject_type="artwork_entity",
                subject_id=entity_id,
            )
            client = OpenAIAPIClient()
            raw = await client.client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_completion_tokens=100,
            )
            text = raw.choices[0].message.content.strip()
            if text.startswith("```"):
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
            scores = json.loads(text)

            def clamp(value: int) -> int:
                return value if value in (-1, 0, 1) else 0

            entity.dim_figurative_abstract = clamp(scores.get("dim_figurative_abstract", 0))
            entity.dim_emotive_conceptual = clamp(scores.get("dim_emotive_conceptual", 0))
            entity.dim_serene_intense = clamp(scores.get("dim_serene_intense", 0))
            entity.dim_classical_avantgarde = clamp(scores.get("dim_classical_avantgarde", 0))
            entity.dim_playful_serious = clamp(scores.get("dim_playful_serious", 0))
            entity.dim_status = "done"
            entity.dim_analyzed_at = datetime.now(UTC)
            entity.dim_error = None
            db.commit()
            token_usage = getattr(raw, "usage", None)
            succeed_ai_usage(
                usage_id,
                input_tokens=getattr(token_usage, "prompt_tokens", None) or getattr(token_usage, "input_tokens", None),
                output_tokens=getattr(token_usage, "completion_tokens", None) or getattr(token_usage, "output_tokens", None),
            )
            logger.info("Dimension analysis done for entity %s", entity_id)
        except Exception as exc:
            fail_ai_usage(usage_id, exc)
            entity.dim_status = "failed"
            entity.dim_error = str(exc)
            db.commit()
            logger.warning("Dimension analysis failed for entity %s: %s", entity_id, exc)
    finally:
        db.close()


def run_dimension_analysis_bg(entity_id: str) -> None:
    asyncio.run(do_dimension_analysis(entity_id))


async def generate_fun_facts(
    artwork_id: str,
    artist_name: str,
    artwork_name: str,
    language: Optional[str],
) -> None:
    with SessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
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
            job_type="artwork_fun_facts",
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
            artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
            if artwork and not artwork.insights:
                artwork.insights = fun_facts
                db.commit()
    except Exception as exc:
        fail_ai_usage(usage_id, exc)
        logger.warning("Fun facts bg task failed for %s: %s", artwork_id, exc)
