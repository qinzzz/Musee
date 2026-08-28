"""Evaluate existing artwork coordinates without writing to the database."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

sys.path.insert(0, ".")

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.services.museum.evaluation import (
    evaluate_artworks,
    apply_local_matches,
    evidence_for_evaluation,
    select_artworks_for_evaluation,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Dry-run the museum resolver against existing geotagged artworks.",
    )
    parser.add_argument("--artwork-id", action="append", dest="artwork_ids")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument(
        "--local-only",
        action="store_true",
        help="Skip OSM and Wikidata network discovery.",
    )
    parser.add_argument(
        "--strict-source",
        action="store_true",
        help="Exclude legacy coordinates whose payload has no explicit evidence source.",
    )
    parser.add_argument(
        "--only-unresolved",
        action="store_true",
        help="Exclude artworks that already have a capture museum association.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Evaluate the full matching population instead of applying --limit.",
    )
    parser.add_argument(
        "--apply-local-matches",
        action="store_true",
        help="Write only terminal local_match results that are still unassociated.",
    )
    parser.add_argument(
        "--allow-prod",
        action="store_true",
        help="Permit --apply-local-matches when ENV=prod.",
    )
    return parser


def main() -> None:
    arguments = build_parser().parse_args()
    if arguments.limit < 1 and not arguments.all:
        raise SystemExit("--limit must be at least 1")
    if arguments.apply_local_matches and not arguments.local_only:
        raise SystemExit("--apply-local-matches requires --local-only")
    if (
        arguments.apply_local_matches
        and settings.env.lower() == "prod"
        and not arguments.allow_prod
    ):
        raise SystemExit("Refusing to write in prod without --allow-prod")

    with SessionLocal() as db:
        population_query = db.query(SavedArtwork).filter(SavedArtwork.active_filter())
        if arguments.artwork_ids:
            population_query = population_query.filter(SavedArtwork.id.in_(arguments.artwork_ids))
        if arguments.only_unresolved:
            population_query = population_query.filter(
                SavedArtwork.capture_museum_entity_id.is_(None),
            )
        population = population_query.all()
        missing_geo = sum(
            evidence_for_evaluation(
                artwork,
                allow_legacy_coordinates=not arguments.strict_source,
            ) is None
            for artwork in population
        )
        effective_limit = max(len(population), 1) if arguments.all else arguments.limit
        selected = select_artworks_for_evaluation(
            db,
            artwork_ids=arguments.artwork_ids,
            limit=effective_limit,
            allow_legacy_coordinates=not arguments.strict_source,
            only_unresolved=arguments.only_unresolved,
        )
        report = asyncio.run(
            evaluate_artworks(db, selected, local_only=arguments.local_only),
        )
        writes_applied = apply_local_matches(db, report) if arguments.apply_local_matches else 0
        if arguments.apply_local_matches:
            db.commit()
        else:
            db.rollback()

    output = report.to_dict()
    output["selected_with_geo"] = len(selected)
    output["population"] = len(population)
    output["missing_geo"] = missing_geo
    output["writes_applied"] = writes_applied
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
