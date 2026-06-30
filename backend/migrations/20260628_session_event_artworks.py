"""
Create session_event_artworks bridge table

Changes:
1. CREATE TABLE session_event_artworks
2. CREATE supporting indexes

Run against DEV:
    python migrations/20260628_session_event_artworks.py

Run against PROD:
    ENV=prod python migrations/20260628_session_event_artworks.py
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
            CREATE TABLE IF NOT EXISTS session_event_artworks (
                id VARCHAR PRIMARY KEY,
                session_event_id VARCHAR NOT NULL REFERENCES session_events(id) ON DELETE CASCADE,
                artwork_id VARCHAR NOT NULL REFERENCES saved_artworks(id) ON DELETE CASCADE,
                role VARCHAR(20) NOT NULL DEFAULT 'subject',
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_session_event_artwork UNIQUE (session_event_id, artwork_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_session_event_artworks_event_position
            ON session_event_artworks(session_event_id, position)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_session_event_artworks_artwork_id
            ON session_event_artworks(artwork_id)
        """))
        conn.commit()

    print("✓ session_event_artworks table ready")


if __name__ == "__main__":
    run()
