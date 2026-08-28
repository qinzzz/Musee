"""Dry-run OSM and Wikidata museum discovery for a coordinate."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict
import json
import sys

sys.path.insert(0, ".")

from app.database.connection import SessionLocal
from app.services.museum.contracts import MuseumResolutionEvidence
from app.services.museum.osm_discovery import discover_museum_candidate
from app.services.museum.repository import find_museums_nearby
from app.services.museum.resolver import _resolution_radius, resolve_museum


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover a museum without writing to the catalogue.")
    parser.add_argument("--latitude", required=True, type=float)
    parser.add_argument("--longitude", required=True, type=float)
    parser.add_argument("--accuracy", type=float, default=15.0)
    arguments = parser.parse_args()
    evidence = MuseumResolutionEvidence(
        latitude=arguments.latitude,
        longitude=arguments.longitude,
        accuracy_meters=arguments.accuracy,
        source="device_live",
    )
    with SessionLocal() as db:
        radius = _resolution_radius(evidence)
        candidates = [] if radius is None else find_museums_nearby(
            db,
            latitude=evidence.latitude,
            longitude=evidence.longitude,
            radius_meters=radius,
        )
        local_result = resolve_museum(db, evidence)

    report = {
        "local_candidates": [
            {
                "id": museum.id,
                "name": museum.canonical_name,
                "qid": museum.wikidata_qid,
                "distance_meters": round(distance, 1),
            }
            for museum, distance in candidates
        ],
        "local_result": asdict(local_result),
        "discovery": None,
    }
    if local_result.status == "unresolved" and local_result.reason == "no_nearby_museum":
        report["discovery"] = asdict(asyncio.run(discover_museum_candidate(evidence)))
    print(json.dumps(report, default=str, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
