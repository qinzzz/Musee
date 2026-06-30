"""
Rename canonical session event storage from session_messages to session_events.

Changes:
1. RENAME TABLE session_messages -> session_events when needed
2. RENAME COLUMN session_event_artworks.session_message_id -> session_event_id when needed
3. Ensure canonical trigger_event_id / payload columns exist on session_events

Run against DEV:
    python migrations/20260628_rename_session_messages_to_events.py

Run against PROD:
    ENV=prod python migrations/20260628_rename_session_messages_to_events.py
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
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'session_messages'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'session_events'
                ) THEN
                    ALTER TABLE session_messages RENAME TO session_events;
                END IF;
            END
            $$;
        """))
        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'session_event_artworks'
                      AND column_name = 'session_message_id'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'session_event_artworks'
                      AND column_name = 'session_event_id'
                ) THEN
                    ALTER TABLE session_event_artworks RENAME COLUMN session_message_id TO session_event_id;
                END IF;
            END
            $$;
        """))
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

    print("✓ session_events canonical rename applied")


if __name__ == "__main__":
    run()
