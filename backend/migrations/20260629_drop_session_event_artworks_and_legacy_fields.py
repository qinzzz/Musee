"""
Canonical session/artwork event cleanup.

Changes:
1. Drop obsolete session_event_artworks bridge table
2. Rename artwork_events.turn_id -> trigger_event_id when needed
3. Rename session_events.turn_id -> trigger_event_id when needed
4. Move session_events.artwork_id into payload and drop the legacy column

Run against DEV:
    python migrations/20260629_drop_session_event_artworks_and_legacy_fields.py

Run against PROD:
    ENV=prod python migrations/20260629_drop_session_event_artworks_and_legacy_fields.py
"""

import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


def run() -> None:
    url = os.environ.get("DATABASE_URL") or settings.effective_database_url
    masked_url = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", url)
    print(f"Target DB: {masked_url[:80]}...")
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
            CREATE TABLE IF NOT EXISTS session_events (
                id VARCHAR PRIMARY KEY,
                session_id VARCHAR NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role VARCHAR(10) NOT NULL,
                type VARCHAR(20) NOT NULL DEFAULT 'message',
                content TEXT,
                trigger_event_id VARCHAR,
                payload JSONB,
                sequence_number INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
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
        conn.execute(text("""
            ALTER TABLE session_events
                ALTER COLUMN payload TYPE JSONB USING payload::jsonb
        """))
        conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'session_events'
                      AND column_name = 'artwork_id'
                ) THEN
                    EXECUTE $sql$
                        UPDATE session_events
                        SET payload = CASE
                            WHEN type IN ('user_input', 'artwork_input', 'artwork_capture') THEN
                                jsonb_set(
                                    COALESCE(payload::jsonb, '{}'::jsonb),
                                    '{artworks}',
                                    jsonb_build_array(jsonb_build_object('artwork_id', artwork_id, 'source', 'library')),
                                    true
                                )
                            ELSE
                                jsonb_set(
                                    COALESCE(payload::jsonb, '{}'::jsonb),
                                    '{artwork_ids}',
                                    jsonb_build_array(artwork_id),
                                    true
                                )
                            END
                        WHERE artwork_id IS NOT NULL
                          AND (
                            payload IS NULL
                            OR (
                                type IN ('user_input', 'artwork_input', 'artwork_capture')
                                AND NOT (payload::jsonb ? 'artworks')
                            )
                            OR (
                                type NOT IN ('user_input', 'artwork_input', 'artwork_capture')
                                AND NOT (payload::jsonb ? 'artwork_ids')
                            )
                          )
                    $sql$;
                    ALTER TABLE session_events DROP COLUMN artwork_id;
                END IF;
            END
            $$;
        """))
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
            ALTER TABLE artwork_events
                ALTER COLUMN payload TYPE JSONB USING payload::jsonb
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_artwork_events_artwork_created
            ON artwork_events(artwork_id, created_at)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_artwork_events_session_created
            ON artwork_events(trigger_session_id, created_at)
        """))
        conn.execute(text("DROP TABLE IF EXISTS session_event_artworks"))
        conn.commit()

    print("✓ session_event_artworks dropped")
    print("✓ session_events.trigger_event_id ready")
    print("✓ session_events.artwork_id moved into payload and dropped")
    print("✓ artwork_events.trigger_event_id ready")


if __name__ == "__main__":
    run()
