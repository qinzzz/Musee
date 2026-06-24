from __future__ import annotations

import json
import logging
import re

from sqlalchemy.orm import Session

from app.database.models import SavedArtwork
from app.services.ai_service import AIServiceFactory
from app.utils.prompt_loader import get_movement_names

logger = logging.getLogger(__name__)


async def enrich_artwork_metadata_batch(
    db: Session,
    user_id: str,
    batch_size: int = 50,
) -> dict:
    artworks = (
        db.query(SavedArtwork)
        .filter(
            SavedArtwork.user_id == user_id,
            SavedArtwork.movement == None,
            SavedArtwork.analysis != None,
        )
        .limit(batch_size)
        .all()
    )

    if not artworks:
        return {"enriched": 0, "message": "No artworks need enrichment"}

    ai_service = AIServiceFactory.get_service()
    movement_names = get_movement_names()
    enrich_prompt = f"""Given this artwork analysis text, identify:
1. movement: the single closest art movement from this canonical list — {movement_names}. Use "Unknown" only if nothing fits.
2. period_bucket: one of "Historical" (pre-1900), "Modern" (1900-1970), "Contemporary" (1970-2010), "Now" (2010-present)

Respond with ONLY valid JSON: {{"movement": "...", "period_bucket": "..."}}

Analysis:
{{analysis}}"""

    enriched_count = 0
    for artwork in artworks:
        try:
            prompt = enrich_prompt.replace("{analysis}", (artwork.analysis or "")[:1000])
            response = await ai_service.ai_client.call_text_only(
                prompt=prompt,
                max_tokens=100,
                temperature=0.1,
            )
            json_match = re.search(r"\{[^}]+\}", response)
            if json_match:
                parsed = json.loads(json_match.group())
                artwork.movement = parsed.get("movement")
                artwork.period_bucket = parsed.get("period_bucket")
                enriched_count += 1
        except Exception as exc:
            logger.warning("Enrichment failed for artwork %s: %s", artwork.id, exc)
            continue

    db.commit()
    return {"enriched": enriched_count, "total_processed": len(artworks)}
