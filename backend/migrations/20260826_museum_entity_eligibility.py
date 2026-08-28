"""Add physical-venue eligibility and OSM identity to museum_entities."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


STATEMENTS = (
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS osm_type VARCHAR(20)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS osm_id VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS is_physical_venue BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS resolution_eligible BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS has_child_venues BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS parent_wikidata_qid VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS validation_source VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_museum_entities_osm_identity ON museum_entities(osm_type, osm_id)",
    "CREATE INDEX IF NOT EXISTS ix_museum_entities_parent_wikidata_qid ON museum_entities(parent_wikidata_qid)",
)


def main() -> None:
    engine = create_engine(settings.effective_database_url)
    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(text(statement))
    print("museum entity eligibility fields ready")


if __name__ == "__main__":
    main()
