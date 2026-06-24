from __future__ import annotations

import asyncio as _asyncio
import logging

from app.database.connection import SessionLocal
from app.database.models import ArtistEntity

logger = logging.getLogger(__name__)


async def do_artist_bio(artist_entity_id: str) -> None:
    from app.services.wikidata_service import get_artist_info_from_wiki

    with SessionLocal() as db:
        entity = db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
        if not entity or entity.bio_status == "done":
            return
        artist_name = entity.display_name
        entity.bio_status = "processing"
        entity.bio = None
        db.commit()

    try:
        bio_data = await get_artist_info_from_wiki(artist_name)
        if bio_data is None:
            bio_data = {
                "bio": None,
                "nationality": None,
                "birth_year": None,
                "death_year": None,
                "movements": [],
            }
        with SessionLocal() as db:
            entity = db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
            if entity:
                entity.bio = bio_data.get("bio")
                entity.nationality = bio_data.get("nationality")
                entity.birth_year = bio_data.get("birth_year")
                entity.death_year = bio_data.get("death_year")
                entity.movements = bio_data.get("movements") or []
                entity.profile_image_url = bio_data.get("profile_image_url")
                entity.bio_status = "done"
                db.commit()
        logger.info("Artist bio done for %s (%s)", artist_entity_id, artist_name)
    except Exception as exc:
        logger.warning("Artist bio failed for %s: %s", artist_entity_id, exc, exc_info=True)
        with SessionLocal() as db:
            entity = db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
            if entity:
                entity.bio_status = "failed"
                db.commit()


def run_artist_bio_bg(artist_entity_id: str) -> None:
    _asyncio.run(do_artist_bio(artist_entity_id))
