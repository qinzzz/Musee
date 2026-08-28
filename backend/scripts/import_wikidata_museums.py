"""Import a bounded regional museum catalogue from Wikidata."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

sys.path.insert(0, ".")

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.services.museum.wikidata_importer import (
    MUSEUM_REGIONS,
    fetch_region_museums,
    import_museum_records,
)


logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import Wikidata museums within a reviewed regional boundary.",
    )
    parser.add_argument(
        "--region",
        choices=tuple(MUSEUM_REGIONS),
        default="san-francisco",
        help="Reviewed regional boundary to fetch.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write inserts and updates. Without this flag the command is a dry run.",
    )
    parser.add_argument(
        "--allow-prod",
        action="store_true",
        help="Permit --apply when ENV=prod.",
    )
    parser.add_argument(
        "--show-records",
        action="store_true",
        help="Print each validated Wikidata museum record.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.apply and settings.env.lower() == "prod" and not args.allow_prod:
        raise SystemExit("Refusing to write in prod without --allow-prod")

    region = MUSEUM_REGIONS[args.region]
    records, fetched, parse_skipped = asyncio.run(fetch_region_museums(region))
    if args.show_records:
        for record in records:
            logger.info(
                "%s | %s | %.6f, %.6f",
                record.qid,
                record.canonical_name,
                record.latitude,
                record.longitude,
            )

    with SessionLocal() as db:
        summary = import_museum_records(
            db,
            records,
            fetched=fetched,
            parse_skipped=parse_skipped,
            dry_run=not args.apply,
        )

    mode = "DRY RUN" if summary.dry_run else "APPLIED"
    logger.info(
        "%s %s: fetched=%d valid=%d insert=%d update=%d unchanged=%d skipped=%d",
        mode,
        region.label,
        summary.fetched,
        summary.valid,
        summary.inserted,
        summary.updated,
        summary.unchanged,
        summary.skipped,
    )


if __name__ == "__main__":
    main()
