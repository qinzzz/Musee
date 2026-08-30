"""Re-run museum resolution over EXISTING artworks after a catalogue change.

Operational tool — there is no user-facing trigger and none is wanted. Run this
with ENV=prod after the catalogue changes (a new region imported, footprints
backfilled) to propagate the improvement to already-uploaded artworks. On-upload
resolution never re-runs on its own (it is guarded by capture_museum_entity_id),
so without this the footprint/catalogue work is invisible to the existing library.

Catalogue-only by design: it calls resolve_museum directly (footprint + nearby
distance), NOT the network discovery path, so it is fast and does no OSM/Wikidata
calls. That is exactly what applies a footprint backfill; discovering brand-new
venues is the on-upload job, not this.

Read-only unless --apply. Idempotent. Scopes (increasing risk):
  only-unresolved  (default) resolve artworks with capture_museum_entity_id IS NULL.
                   Purely additive — never changes an existing association.
  upgrade          also re-resolve ASSOCIATED artworks, but overwrite ONLY when the
                   new result is a footprint match (the strongest signal) pointing
                   at a different venue. Corrects loose distance associations; never
                   downgrades or removes one.
  all              overwrite whenever the new result differs (risky; may regress).

Usage (from backend/):
    ENV=prod ... python scripts/reresolve_museum_captures.py                    # dry run, only-unresolved
    ENV=prod ... python scripts/reresolve_museum_captures.py --apply --allow-prod
    ENV=prod ... python scripts/reresolve_museum_captures.py --scope upgrade --apply --allow-prod
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter

sys.path.insert(0, ".")

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.services.artwork_event_service import (
    ARTWORK_EVENT_MUSEUM_RESOLUTION,
    log_artwork_event,
)
from app.services.museum.evaluation import evidence_for_evaluation
from app.services.museum.resolver import resolve_museum, resolution_bucket

SCOPES = ("only-unresolved", "upgrade", "all")
BATCH_WRITE_SIZE = 50


def _should_write(scope: str, current_id, new_id, bucket: str, *, include_distance: bool) -> bool:
    if not new_id:
        return False
    is_footprint = bucket == "footprint"
    # Footprint-only by default: a footprint (point-in-polygon) match is reliable
    # at any GPS accuracy, but a bare-distance match on a legacy coordinate (unknown
    # accuracy) is exactly the street-capture false-positive risk. --include-distance
    # opts into distance writes when the operator accepts that trade.
    if not is_footprint and not include_distance:
        return False
    if current_id is None:
        return True  # fill a NULL
    if new_id == current_id:
        return False  # already there
    if scope == "only-unresolved":
        return False  # never touch an existing association
    if scope == "upgrade":
        return is_footprint  # overwrite only for the strongest signal
    return True  # scope == "all"


def reresolve_captures(
    session_factory,
    *,
    scope: str,
    apply: bool,
    limit: int = 0,
    include_distance: bool = False,
    batch_size: int = BATCH_WRITE_SIZE,
) -> dict:
    stats: Counter = Counter({"scanned": 0, "updated": 0, "no_evidence": 0})
    with session_factory() as db:
        query = db.query(SavedArtwork).filter(SavedArtwork.active_filter())
        if scope == "only-unresolved":
            query = query.filter(SavedArtwork.capture_museum_entity_id.is_(None))
        query = query.order_by(SavedArtwork.id)
        if limit:
            query = query.limit(limit)

        pending = 0
        for artwork in query.all():
            stats["scanned"] += 1
            # allow_legacy_coordinates: treat coords with no source tag as legacy
            # capture evidence (the bulk of the existing backlog), matching the eval.
            evidence = evidence_for_evaluation(artwork, allow_legacy_coordinates=True)
            if evidence is None:
                stats["no_evidence"] += 1
                continue

            result = resolve_museum(db, evidence)
            new_id = result.museum_entity_id if result.status == "resolved" else None
            bucket = resolution_bucket(result.status, result.reason)
            stats[f"outcome_{bucket}"] += 1

            if not _should_write(
                scope, artwork.capture_museum_entity_id, new_id, bucket,
                include_distance=include_distance,
            ):
                continue

            stats["updated"] += 1
            logging.info("update %s: %s -> %s (%s)",
                         artwork.id, artwork.capture_museum_entity_id, new_id, bucket)
            if apply:
                artwork.capture_museum_entity_id = new_id
                log_artwork_event(
                    db, artwork_id=str(artwork.id),
                    event_type=ARTWORK_EVENT_MUSEUM_RESOLUTION,
                    payload={
                        "bucket": bucket, "status": result.status, "reason": result.reason,
                        "museum_entity_id": new_id, "distance_m": result.distance_meters,
                        "evidence_source": evidence.source, "accuracy_m": evidence.accuracy_meters,
                        "associated": True, "resolution_source": "reresolve",
                    },
                )
                pending += 1
                if pending >= batch_size:
                    db.commit()
                    pending = 0

        if apply:
            db.commit()
        else:
            db.rollback()
    return dict(stats)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--scope", choices=SCOPES, default="only-unresolved")
    parser.add_argument("--apply", action="store_true",
                        help="Write changes. Without this the run is a dry run.")
    parser.add_argument("--allow-prod", action="store_true", help="Permit --apply when ENV=prod.")
    parser.add_argument("--limit", type=int, default=0, help="0 = all matching artworks.")
    parser.add_argument("--include-distance", action="store_true",
                        help="Also write bare-distance matches (risky on legacy coords; "
                             "default writes only footprint matches).")
    args = parser.parse_args()

    if args.apply and settings.env.lower() == "prod" and not args.allow_prod:
        raise SystemExit("Refusing to write in prod without --allow-prod")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    stats = reresolve_captures(
        SessionLocal, scope=args.scope, apply=args.apply, limit=args.limit,
        include_distance=args.include_distance,
    )
    print(json.dumps({"mode": "APPLIED" if args.apply else "DRY RUN",
                      "scope": args.scope, **stats}, indent=2))


if __name__ == "__main__":
    main()
