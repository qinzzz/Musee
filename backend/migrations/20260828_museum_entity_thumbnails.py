"""Add persistable Wikimedia Commons thumbnail metadata to museum entities."""

import sys

sys.path.insert(0, ".")

from sqlalchemy import text

from app.database.connection import engine


STATEMENTS = (
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_file_name VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_source VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_source_url VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_attribution TEXT",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_license VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_updated_at TIMESTAMP",
    "CREATE INDEX IF NOT EXISTS ix_saved_artworks_user_museum_active ON saved_artworks(user_id, capture_museum_entity_id) WHERE deleted_at IS NULL",
)


def main() -> None:
    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(text(statement))
    print("museum entity thumbnail metadata ready")


if __name__ == "__main__":
    main()
