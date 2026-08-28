"""Add lightweight physical footprint storage to museum_entities."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


STATEMENTS = (
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_geojson JSONB",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_min_latitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_max_latitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_min_longitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_max_longitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_source VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_license VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_updated_at TIMESTAMP",
)


def main() -> None:
    engine = create_engine(settings.effective_database_url)
    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(text(statement))
    print("museum entity footprint fields ready")


if __name__ == "__main__":
    main()
