"""
Schema extension: session_events event fields

Changes:
1. ALTER TABLE session_events ADD COLUMN trigger_event_id
2. ALTER TABLE session_events ADD COLUMN payload

Notes:
- This migration does not rewrite legacy type values.
- Old rows remain readable and will be normalized in application code.

Run against DEV:
    python migrations/20260628_session_message_event_fields.py

Run against PROD:
    ENV=prod python migrations/20260628_session_message_event_fields.py
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
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'session_events'
                      AND column_name = 'turn_id'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'session_events'
                      AND column_name = 'trigger_event_id'
                ) THEN
                    ALTER TABLE session_events RENAME COLUMN turn_id TO trigger_event_id;
                END IF;
            END
            $$;
        """))
        conn.execute(text("""
            ALTER TABLE session_events
                ADD COLUMN IF NOT EXISTS trigger_event_id VARCHAR
        """))
        conn.execute(text("""
            ALTER TABLE session_events
                ADD COLUMN IF NOT EXISTS payload JSONB
        """))
        conn.commit()

    print("✓ session_events.trigger_event_id column ready")
    print("✓ session_events.payload column ready")


if __name__ == "__main__":
    run()
