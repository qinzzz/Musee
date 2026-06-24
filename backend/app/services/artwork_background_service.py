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
from app.services.artwork_analysis_service import determine_ai_provider
from app.services.openai_api_client import OpenAIAPIClient

logger = logging.getLogger(__name__)

ACTIVE_ARTWORK_TASKS: set[asyncio.Task] = set()

TIER_ARTWORK_LIMIT: dict[str, int | None] = {
    "free": 20,
    "member": 200,
    "power": None,
}

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


def get_quota(tier: str) -> int | None:
    return TIER_ARTWORK_LIMIT.get(tier or "free", TIER_ARTWORK_LIMIT["free"])


def check_artwork_quota(user_id: str, db: Session) -> None:
    user = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    tier = (user.tier if user else None) or "free"
    limit = get_quota(tier)
    if limit is None:
        return

    count = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).count()
    if count >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "quota_exceeded",
                "tier": tier,
                "limit": limit,
                "used": count,
                "message": f"You've reached the {tier} plan limit of {limit} artworks.",
            },
        )


async def do_dimension_analysis(entity_id: str) -> None:
    db = SessionLocal()
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
            logger.info("Dimension analysis done for entity %s", entity_id)
        except Exception as exc:
            entity.dim_status = "failed"
            entity.dim_error = str(exc)
            db.commit()
            logger.warning("Dimension analysis failed for entity %s: %s", entity_id, exc)
    finally:
        db.close()


def run_dimension_analysis_bg(entity_id: str) -> None:
    asyncio.run(do_dimension_analysis(entity_id))


async def do_insights(
    artwork_id: str,
    artist_name: str,
    artwork_name: str,
    language: Optional[str],
) -> None:
    if not artist_name or artist_name.lower() in ("unknown", "unknown artist", ""):
        return

    try:
        ai_service = AIServiceFactory.get_service(determine_ai_provider(None))
        points = await ai_service.get_insights(
            artist_name=artist_name,
            artwork_name=artwork_name or "Untitled",
            language=language,
        )
        with SessionLocal() as db:
            artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
            if artwork:
                artwork.insights = points
                db.commit()
    except Exception as exc:
        logger.warning("Insights bg task failed for %s: %s", artwork_id, exc)
