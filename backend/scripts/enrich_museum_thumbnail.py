"""Best-effort Wikimedia Commons thumbnail enrichment for museum venues."""

from __future__ import annotations

import argparse
import sys

sys.path.insert(0, ".")

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import MuseumEntity
from app.services.museum.thumbnail_enrichment import (
    enrich_museum_thumbnail,
    enrich_museum_thumbnails,
    select_museum_ids_for_thumbnail_enrichment,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich museum thumbnails from Wikidata.")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--qid")
    target.add_argument(
        "--passport-only",
        action="store_true",
        help="Enrich missing thumbnails only for museums associated with active artworks.",
    )
    target.add_argument(
        "--all-missing",
        action="store_true",
        help="Enrich every active catalogue museum with a QID and no thumbnail.",
    )
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--allow-prod",
        action="store_true",
        help="Permit thumbnail writes when ENV=prod.",
    )
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit must be at least 1")
    if settings.env.lower() == "prod" and not args.allow_prod:
        raise SystemExit("Refusing to write in prod without --allow-prod")

    with SessionLocal() as db:
        if args.qid:
            museum = db.query(MuseumEntity).filter(MuseumEntity.wikidata_qid == args.qid).first()
            if museum is None:
                raise SystemExit(f"No museum entity found for {args.qid}")
            museum_ids = [str(museum.id)]
        else:
            museum_ids = select_museum_ids_for_thumbnail_enrichment(
                db,
                passport_only=args.passport_only,
                limit=args.limit,
            )

    if args.qid:
        enrich_museum_thumbnail(museum_ids[0])
    else:
        enrich_museum_thumbnails(museum_ids)

    with SessionLocal() as db:
        enriched = (
            db.query(MuseumEntity)
            .filter(
                MuseumEntity.id.in_(museum_ids),
                MuseumEntity.thumbnail_url.isnot(None),
            )
            .order_by(MuseumEntity.canonical_name)
            .all()
        )
        for museum in enriched:
            print(f"{museum.canonical_name}: {museum.thumbnail_source_url or museum.thumbnail_url}")
    print(f"requested={len(museum_ids)} enriched={len(enriched)}")


if __name__ == "__main__":
    main()
