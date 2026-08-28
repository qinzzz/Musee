"""Read-only diagnostic for local museum resolution at a coordinate."""

from __future__ import annotations

import argparse
import sys

sys.path.insert(0, ".")

from app.database.connection import SessionLocal
from app.services.museum.contracts import MuseumResolutionEvidence
from app.services.museum.repository import find_museums_nearby
from app.services.museum.resolver import _resolution_radius, resolve_museum


def main() -> None:
    parser = argparse.ArgumentParser(description="Test local museum resolution without writing.")
    parser.add_argument("--latitude", required=True, type=float)
    parser.add_argument("--longitude", required=True, type=float)
    parser.add_argument("--accuracy", type=float, default=15.0)
    parser.add_argument(
        "--source",
        choices=("device_live", "image_exif", "legacy_artwork_location"),
        default="device_live",
    )
    arguments = parser.parse_args()
    evidence = MuseumResolutionEvidence(
        latitude=arguments.latitude,
        longitude=arguments.longitude,
        accuracy_meters=arguments.accuracy,
        source=arguments.source,
    )

    with SessionLocal() as db:
        radius = _resolution_radius(evidence)
        candidates = [] if radius is None else find_museums_nearby(
            db,
            latitude=evidence.latitude,
            longitude=evidence.longitude,
            radius_meters=radius,
        )
        for museum, distance in candidates:
            print(f"candidate {museum.canonical_name} qid={museum.wikidata_qid} distance_m={distance:.1f}")
        print(f"result {resolve_museum(db, evidence)}")


if __name__ == "__main__":
    main()
