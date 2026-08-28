"""Create the physical museum catalog and artwork capture association.

Run against DEV:
    python migrations/20260824_museum_entities.py

Run against PROD:
    ENV=prod python migrations/20260824_museum_entities.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS museum_entities (
        id VARCHAR PRIMARY KEY,
        canonical_name VARCHAR NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        country_code VARCHAR(2),
        wikidata_qid VARCHAR,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_museum_entities_wikidata_qid UNIQUE (wikidata_qid)
    )
    """,
    """
    ALTER TABLE saved_artworks
    ADD COLUMN IF NOT EXISTS capture_museum_entity_id VARCHAR
    REFERENCES museum_entities(id) ON DELETE SET NULL
    """,
    "CREATE INDEX IF NOT EXISTS idx_museum_entities_coordinates ON museum_entities(latitude, longitude)",
    "CREATE INDEX IF NOT EXISTS idx_museum_entities_country ON museum_entities(country_code)",
    "CREATE INDEX IF NOT EXISTS ix_saved_artworks_capture_museum_entity_id ON saved_artworks(capture_museum_entity_id)",
)


def main() -> None:
    engine = create_engine(settings.effective_database_url)
    with engine.begin() as conn:
        for statement in STATEMENTS:
            conn.execute(text(statement))
    print("museum_entities and capture association ready")


if __name__ == "__main__":
    main()
