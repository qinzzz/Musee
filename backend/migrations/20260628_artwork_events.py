"""
Create artwork_events table

Changes:
1. CREATE TABLE artwork_events
2. CREATE supporting indexes

Run against DEV:
    python migrations/20260628_artwork_events.py

Run against PROD:
    ENV=prod python migrations/20260628_artwork_events.py
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
            CREATE TABLE IF NOT EXISTS artwork_events (
                id VARCHAR PRIMARY KEY,
                artwork_id VARCHAR NOT NULL REFERENCES saved_artworks(id) ON DELETE CASCADE,
                event_type VARCHAR(50) NOT NULL,
                actor_role VARCHAR(20) NOT NULL DEFAULT 'system',
                trigger_source VARCHAR(30),
                trigger_session_id VARCHAR REFERENCES sessions(id) ON DELETE SET NULL,
                trigger_event_id VARCHAR,
                parent_event_id VARCHAR REFERENCES artwork_events(id) ON DELETE SET NULL,
                payload JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'artwork_events'
                      AND column_name = 'turn_id'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'artwork_events'
                      AND column_name = 'trigger_event_id'
                ) THEN
                    ALTER TABLE artwork_events RENAME COLUMN turn_id TO trigger_event_id;
                END IF;
            END
            $$;
        """))
        conn.execute(text("""
            ALTER TABLE artwork_events
                ADD COLUMN IF NOT EXISTS trigger_event_id VARCHAR
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_artwork_events_artwork_created
            ON artwork_events(artwork_id, created_at)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_artwork_events_session_created
            ON artwork_events(trigger_session_id, created_at)
        """))
        conn.commit()

    print("✓ artwork_events table ready")


if __name__ == "__main__":
    run()
