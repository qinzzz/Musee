"""
Drop the obsolete saved_artworks.summary column.

Run against DEV:
    python migrations/20260722_drop_saved_artwork_summary.py

Run against PROD:
    ENV=prod python migrations/20260722_drop_saved_artwork_summary.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


def main() -> None:
    engine = create_engine(settings.effective_database_url)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE saved_artworks DROP COLUMN IF EXISTS summary"))
    print("saved_artworks.summary removed")


if __name__ == "__main__":
    main()
