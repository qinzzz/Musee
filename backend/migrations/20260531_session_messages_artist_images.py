"""
Production migration: session_messages table + artist profile images

Changes:
1. CREATE TABLE session_messages  — unified session conversation store
   (replaces per-artwork conversations table which is deprecated)
2. ALTER TABLE artist_entities ADD COLUMN profile_image_url
3. sessions.metadata_json already exists as JSON; no schema change needed
   (user_goal is stored as a key inside it)

Run against PROD:
    ENV=prod python migrations/20260531_session_messages_artist_images.py

Run against DEV:
    python migrations/20260531_session_messages_artist_images.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text
from app.config.settings import settings


def run():
    url = settings.effective_database_url
    print(f"Migrating: {url[:60]}...")
    engine = create_engine(url)

    with engine.connect() as conn:
        # ── 1. session_messages ──────────────────────────────────────────
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS session_messages (
                id              VARCHAR PRIMARY KEY,
                session_id      VARCHAR NOT NULL
                                    REFERENCES sessions(id) ON DELETE CASCADE,
                role            VARCHAR(10) NOT NULL,
                type            VARCHAR(20) NOT NULL DEFAULT 'text',
                content         TEXT,
                artwork_id      VARCHAR
                                    REFERENCES saved_artworks(id) ON DELETE SET NULL,
                sequence_number INTEGER NOT NULL,
                created_at      TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_session_messages_session_id
                ON session_messages(session_id)
        """))
        print("  ✓ session_messages table ready")

        # ── 2. artist_entities.profile_image_url ────────────────────────
        conn.execute(text("""
            ALTER TABLE artist_entities
                ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR
        """))
        print("  ✓ artist_entities.profile_image_url column ready")

        conn.commit()

    print("Migration complete.")


if __name__ == "__main__":
    run()
