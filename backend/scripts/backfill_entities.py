"""
Backfill: create ArtworkEntity for every SavedArtwork that lacks one,
then link the artwork and trigger dimension analysis.

Usage:
    cd backend
    source venv/bin/activate
    python scripts/backfill_entities.py [--analyze] [--dry-run]

--analyze  : also trigger dimension analysis for newly created entities
--dry-run  : print what would happen without writing to DB
"""

import sys
import re
import asyncio
import argparse
import logging

sys.path.insert(0, ".")  # run from backend/

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, ArtworkEntity

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def _normalize(s: str) -> str:
    s = s.lower().strip()
    if s.startswith("the "):
        s = s[4:]
    return re.sub(r"\s+", " ", s)


def backfill(dry_run: bool = False, analyze: bool = False):
    db = SessionLocal()
    try:
        # All artworks without an entity link
        unlinked = (
            db.query(SavedArtwork)
            .filter(SavedArtwork.artwork_entity_id == None)
            .all()
        )
        log.info(f"Found {len(unlinked)} artworks without an entity link")

        created = 0
        linked = 0
        skipped = 0
        entity_ids_to_analyze = []

        for artwork in unlinked:
            artist = (artwork.artist_name or "").strip()
            title = (artwork.artwork_name or "").strip()

            # Skip truly unknown / junk artworks
            skip_artists = {"unknown", "unknown artist", "未知艺术家", "not an artwork?"}
            skip_titles = {"unknown", "untitled", "unknown title", "unknown artwork"}
            if (
                not artist
                or not title
                or artist.lower() in skip_artists
                or title.lower() in skip_titles
                or artwork.is_recognized == 0
            ):
                skipped += 1
                continue

            can_artist = _normalize(artist)
            can_title = _normalize(title)

            if dry_run:
                log.info(f"  [dry] would upsert entity: '{artist}' / '{title}'")
                linked += 1
                continue

            # Upsert entity
            entity = (
                db.query(ArtworkEntity)
                .filter_by(canonical_artist=can_artist, canonical_title=can_title)
                .first()
            )
            if entity:
                entity.instance_count = (entity.instance_count or 0) + 1
            else:
                entity = ArtworkEntity(
                    canonical_artist=can_artist,
                    canonical_title=can_title,
                    display_artist=artist,
                    display_title=title,
                    instance_count=1,
                )
                db.add(entity)
                db.flush()  # get the id
                created += 1

            artwork.artwork_entity_id = entity.id
            linked += 1

            if analyze and entity.dim_status in ("pending", None):
                entity_ids_to_analyze.append(entity.id)

        if not dry_run:
            db.commit()
            log.info(f"Done — created {created} new entities, linked {linked} artworks, skipped {skipped} (unknown)")

            if analyze and entity_ids_to_analyze:
                log.info(f"Triggering dimension analysis for {len(entity_ids_to_analyze)} entities...")
                from app.routers.artwork import _do_dimension_analysis
                for eid in entity_ids_to_analyze:
                    try:
                        asyncio.run(_do_dimension_analysis(eid))
                        log.info(f"  analyzed {eid[:8]}")
                    except Exception as e:
                        log.warning(f"  failed {eid[:8]}: {e}")
        else:
            log.info(f"[dry-run] would link {linked}, skip {skipped}")

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--analyze", action="store_true", help="Run dimension analysis after linking")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    backfill(dry_run=args.dry_run, analyze=args.analyze)
