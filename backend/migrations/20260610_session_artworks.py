"""
Production migration: session_artworks table

Changes:
1. CREATE TABLE session_artworks
2. CREATE supporting indexes

Run against PROD:
    ENV=prod python migrations/20260610_session_artworks.py

Run against DEV:
    python migrations/20260610_session_artworks.py
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
            CREATE TABLE IF NOT EXISTS session_artworks (
                id VARCHAR PRIMARY KEY,
                session_id VARCHAR NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                artwork_id VARCHAR NOT NULL REFERENCES saved_artworks(id) ON DELETE CASCADE,
                sequence_number INTEGER NOT NULL DEFAULT 0,
                source VARCHAR(20) NOT NULL DEFAULT 'library',
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_session_artwork UNIQUE (session_id, artwork_id)
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_session_artworks_session_sequence
            ON session_artworks(session_id, sequence_number)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_session_artworks_artwork_id
            ON session_artworks(artwork_id)
        """))
        conn.commit()

    print("✓ session_artworks table and indexes are ready")


if __name__ == "__main__":
    run()
