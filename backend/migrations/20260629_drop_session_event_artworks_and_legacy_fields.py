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
        conn.execute(text("DROP TABLE IF EXISTS session_event_artworks"))
        conn.commit()

    print("✓ session_event_artworks dropped")
    print("✓ session_events.trigger_event_id ready")
    print("✓ session_events.artwork_id moved into payload and dropped")
    print("✓ artwork_events.trigger_event_id ready")


if __name__ == "__main__":
    run()
