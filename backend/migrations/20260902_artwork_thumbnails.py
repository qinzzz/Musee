"""Add the nullable cloud thumbnail URI for saved artworks.

Run against DEV:
    python migrations/20260902_artwork_thumbnails.py

Run against PROD:
    ENV=prod python migrations/20260902_artwork_thumbnails.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


def main() -> None:
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS thumbnail_uri VARCHAR")
        )
    print("saved artwork thumbnail contract ready")


if __name__ == "__main__":
    main()
