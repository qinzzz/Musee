"""Backfill OSM building footprints onto catalogue museums that lack them.

Wikidata imports only carry a P625 point, so every entity from
import_wikidata_museums.py has footprint_geojson = NULL. With no footprint the
resolver can never take its footprint-first path (resolver.py) and falls back to
coarse centroid distance — which is why large museums resolve at 100-275m and
street captures near a museum get mis-assigned. This backfill fetches each
catalogue museum's OSM building polygon (reusing the same Overpass provider the
live resolver uses) and stores it, so point-in-polygon matching can work.

Conservative by design: a wrong footprint is worse than none (it would make a
neighbour's building "contain" captures), so a match is accepted only on exact
Wikidata QID identity by default. --allow-name-match adds an exact-name fallback.

Read-only unless --apply. Idempotent: only rows without usable footprint bounds
are touched (footprint_min_latitude IS NULL — this also catches rows carrying a
non-null-but-empty footprint_geojson from the import path), so re-runs skip what
is already filled — which also makes re-running the natural retry for entities
skipped by transient Overpass errors.

The sweep never holds a DB connection during the (slow, minutes-long) Overpass
phase: work items are read in a short session, all network happens with no
connection checked out, then results are written in a fresh session. Holding one
Neon connection across the whole sweep gets it closed server-side ("SSL
connection has been closed unexpectedly") by the time we commit.

Usage (from backend/):
    ENV=dev NEON_DATABASE_URL_DEV=... python scripts/backfill_museum_footprints.py
    ENV=dev  ... python scripts/backfill_museum_footprints.py --apply
    ENV=prod ... python scripts/backfill_museum_footprints.py --apply --allow-prod
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Callable, Optional

sys.path.insert(0, ".")

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import MuseumEntity
from app.services.museum.geometry import footprint_bounds
from app.services.museum.osm_discovery import (
    OSMCandidateProvider,
    OSMMuseumCandidate,
    OverpassMuseumProvider,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)

BACKFILL_RADIUS_METERS = 150
INTER_REQUEST_SLEEP_SECONDS = 1.0  # be polite to the shared Overpass endpoint
BATCH_WRITE_SIZE = 25  # commit in batches so an interrupt loses at most this many
OSM_FOOTPRINT_LICENSE = "odbl"


def select_footprint_candidate(
    qid: Optional[str],
    name: Optional[str],
    candidates: list[OSMMuseumCandidate],
    *,
    allow_name_match: bool,
) -> tuple[Optional[OSMMuseumCandidate], str]:
    """Pick the OSM candidate that IS this museum, and only if it has a polygon.

    Returns (candidate, how) where how is 'qid' | 'name' | 'none'. Never guesses
    by proximity alone — that is exactly how a neighbour's footprint would get
    attached to the wrong museum.
    """
    with_polygon = [c for c in candidates if c.footprint_geojson]
    if qid:
        for candidate in with_polygon:
            if candidate.wikidata_qid == qid:
                return candidate, "qid"
    if allow_name_match:
        target = (name or "").strip().casefold()
        named = [c for c in with_polygon if (c.name or "").strip().casefold() == target]
        if named:
            return min(named, key=lambda c: c.distance_meters), "name"
    return None, "none"


async def backfill_footprints(
    session_factory: Callable[[], object],
    provider: OSMCandidateProvider,
    *,
    apply: bool,
    limit: int = 0,
    allow_name_match: bool = False,
    radius_meters: int = BACKFILL_RADIUS_METERS,
    sleep_seconds: float = INTER_REQUEST_SLEEP_SECONDS,
) -> dict[str, int]:
    """Read work items, fetch footprints over the network (no DB held), then write.

    session_factory() must yield a Session usable as a context manager (e.g.
    SessionLocal). It is called for a short read, and again for a short write.
    """
    # Phase 1 — read the work list, then release the connection.
    # "Needs a footprint" == no usable polygon bounds. Some rows carry a
    # non-null-but-empty footprint_geojson (no geometry, no extent) from the
    # import path, so footprint_geojson IS NULL misses them. footprint_min_latitude
    # is the reliable signal — it is set only for a real polygon and is exactly
    # what the resolver's footprint match filters on (repository.py).
    work: list[dict] = []
    with session_factory() as db:
        query = (
            db.query(MuseumEntity)
            .filter(MuseumEntity.footprint_min_latitude.is_(None))
            .order_by(MuseumEntity.canonical_name)
        )
        if limit:
            query = query.limit(limit)
        for entity in query.all():
            work.append({
                "id": entity.id,
                "name": entity.canonical_name,
                "lat": entity.latitude,
                "lon": entity.longitude,
                "qid": entity.wikidata_qid,
            })

    # Phase 2 — network sweep holding NO DB connection; commit in small batches
    # from short-lived sessions. Progress prints per museum, and an interrupt loses
    # at most one batch (holding a connection across the whole sweep gets it killed
    # by Neon; pre_ping only validates a connection when a fresh one is checked out).
    stats = {
        "scanned": 0, "written": 0,
        "no_osm_result": 0, "no_polygon_match": 0, "provider_error": 0,
    }
    total = len(work)
    logger.info("Backfilling footprints for %d museums (apply=%s, batch=%d)",
                total, apply, BATCH_WRITE_SIZE)
    pending: list[tuple[str, OSMMuseumCandidate, str]] = []

    def flush() -> None:
        if not (apply and pending):
            return
        with session_factory() as db:  # fresh connection, pre_ping-validated
            for entity_id, candidate, _how in pending:
                entity = db.get(MuseumEntity, entity_id)
                if entity is None or entity.footprint_min_latitude is not None:
                    continue  # re-check: another run may have filled it
                _attach_footprint(entity, candidate)
                stats["written"] += 1
            db.commit()
        pending.clear()

    for index, item in enumerate(work):
        stats["scanned"] += 1
        label = f"[{index + 1}/{total}] {item['name'][:38]:38}"
        try:
            candidates = await provider.find_museums(item["lat"], item["lon"], radius_meters)
        except Exception as exc:  # transient Overpass failure: skip, retry on re-run
            stats["provider_error"] += 1
            logger.info("%s  error: %s", label, exc)
            candidates = []
        else:
            if not candidates:
                stats["no_osm_result"] += 1
                logger.info("%s  no osm museum nearby", label)
            else:
                match, how = select_footprint_candidate(
                    item["qid"], item["name"], candidates, allow_name_match=allow_name_match
                )
                if match is None:
                    stats["no_polygon_match"] += 1
                    logger.info("%s  skip (%d cands, no polygon)", label, len(candidates))
                else:
                    pending.append((item["id"], match, how))
                    logger.info("%s  %s %s/%s (%s)", label,
                                "fill" if apply else "would-fill",
                                match.osm_type, match.osm_id, how)

        if apply and len(pending) >= BATCH_WRITE_SIZE:
            flush()
        if sleep_seconds and index < total - 1:
            await asyncio.sleep(sleep_seconds)

    flush()  # final partial batch
    if not apply:
        stats["written"] = len(pending)  # would-write count for the dry run
    return stats


def _attach_footprint(entity: MuseumEntity, candidate: OSMMuseumCandidate) -> None:
    entity.footprint_geojson = candidate.footprint_geojson
    bounds = footprint_bounds(candidate.footprint_geojson)
    if bounds:
        (
            entity.footprint_min_latitude,
            entity.footprint_max_latitude,
            entity.footprint_min_longitude,
            entity.footprint_max_longitude,
        ) = bounds
    entity.footprint_source = "osm"
    entity.footprint_license = OSM_FOOTPRINT_LICENSE
    entity.footprint_updated_at = datetime.now(timezone.utc)
    if not entity.osm_id and candidate.osm_id:
        entity.osm_id = f"{candidate.osm_type}/{candidate.osm_id}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Attach OSM footprints to catalogue museums that lack them.",
    )
    parser.add_argument("--apply", action="store_true",
                        help="Write footprints. Without this the run is a dry run.")
    parser.add_argument("--allow-prod", action="store_true",
                        help="Permit --apply when ENV=prod.")
    parser.add_argument("--allow-name-match", action="store_true",
                        help="Also accept an exact-name match when no QID matches.")
    parser.add_argument("--limit", type=int, default=0, help="0 = all pending.")
    parser.add_argument("--radius", type=int, default=BACKFILL_RADIUS_METERS)
    parser.add_argument("--sleep", type=float, default=INTER_REQUEST_SLEEP_SECONDS)
    args = parser.parse_args()

    if args.apply and settings.env.lower() == "prod" and not args.allow_prod:
        raise SystemExit("Refusing to write in prod without --allow-prod")

    provider = OverpassMuseumProvider()
    stats = asyncio.run(backfill_footprints(
        SessionLocal,
        provider,
        apply=args.apply,
        limit=args.limit,
        allow_name_match=args.allow_name_match,
        radius_meters=args.radius,
        sleep_seconds=args.sleep,
    ))

    mode = "APPLIED" if args.apply else "DRY RUN"
    print(json.dumps({"mode": mode, **stats}, indent=2))


if __name__ == "__main__":
    main()
