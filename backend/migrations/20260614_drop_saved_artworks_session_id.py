"""
Schema cleanup: drop legacy saved_artworks.session_id

Prerequisite:
- Application code must already read session membership from session_artworks.

Changes:
1. DROP COLUMN saved_artworks.session_id

Run against DEV:
    python migrations/20260614_drop_saved_artworks_session_id.py

Run against PROD:
    ENV=prod python migrations/20260614_drop_saved_artworks_session_id.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


def run() -> None:
    url = settings.effective_database_url
    print(f"Target DB: {url[:60]}...")
    engine = create_engine(url)

    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE saved_artworks
            DROP COLUMN IF EXISTS session_id CASCADE
        """))
        conn.commit()

    print("✓ dropped saved_artworks.session_id")


if __name__ == "__main__":
    run()
