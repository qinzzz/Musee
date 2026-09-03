"""
Ensure production runtime schema exists.

Background:
- The app uses SQLAlchemy create_all() at startup, which creates missing tables
  but does not add columns to existing tables.
- Some runtime tables/columns have historically lived only in bootstrap/admin
  repair code instead of a formal migration.

This migration is intentionally idempotent. It is safe to run more than once.

Run against DEV:
    python migrations/20260706_ensure_runtime_schema.py

Run against PROD:
    ENV=prod python migrations/20260706_ensure_runtime_schema.py
"""

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR PRIMARY KEY,
        username VARCHAR UNIQUE,
        email VARCHAR UNIQUE,
        device_id VARCHAR UNIQUE,
        google_id VARCHAR UNIQUE,
        profile_picture_url VARCHAR,
        full_name VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        last_active TIMESTAMP DEFAULT NOW(),
        settings JSONB,
        skill_stats JSONB,
        tier VARCHAR(20) NOT NULL DEFAULT 'free'
    )
    """,
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_stats JSONB",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free'",
    "CREATE INDEX IF NOT EXISTS ix_users_google_id ON users(google_id)",
    """
    CREATE TABLE IF NOT EXISTS artist_entities (
        id VARCHAR PRIMARY KEY,
        canonical_name VARCHAR NOT NULL UNIQUE,
        display_name VARCHAR NOT NULL,
        bio TEXT,
        nationality VARCHAR,
        birth_year INTEGER,
        death_year INTEGER,
        movements JSONB,
        profile_image_url VARCHAR,
        instance_count INTEGER DEFAULT 1,
        bio_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    """,
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS bio TEXT",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS nationality VARCHAR",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS birth_year INTEGER",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS death_year INTEGER",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS movements JSONB",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS instance_count INTEGER DEFAULT 1",
    "ALTER TABLE artist_entities ADD COLUMN IF NOT EXISTS bio_status VARCHAR(20) DEFAULT 'pending'",
    """
    CREATE TABLE IF NOT EXISTS artwork_entities (
        id VARCHAR PRIMARY KEY,
        canonical_artist VARCHAR NOT NULL,
        canonical_title VARCHAR NOT NULL,
        display_artist VARCHAR NOT NULL,
        display_title VARCHAR NOT NULL,
        instance_count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        dim_figurative_abstract SMALLINT,
        dim_emotive_conceptual SMALLINT,
        dim_serene_intense SMALLINT,
        dim_classical_avantgarde SMALLINT,
        dim_playful_serious SMALLINT,
        dim_status VARCHAR(20) DEFAULT 'pending',
        dim_analyzed_at TIMESTAMP,
        dim_error TEXT,
        CONSTRAINT uq_entity_artist_title UNIQUE (canonical_artist, canonical_title)
    )
    """,
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_figurative_abstract SMALLINT",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_emotive_conceptual SMALLINT",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_serene_intense SMALLINT",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_classical_avantgarde SMALLINT",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_playful_serious SMALLINT",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_status VARCHAR(20) DEFAULT 'pending'",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_analyzed_at TIMESTAMP",
    "ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS dim_error TEXT",
    """
    CREATE TABLE IF NOT EXISTS saved_artworks (
        id VARCHAR PRIMARY KEY,
        photo_uri VARCHAR NOT NULL,
        thumbnail_uri VARCHAR,
        artist_name VARCHAR NOT NULL,
        artwork_name VARCHAR NOT NULL,
        location JSONB,
        photo_time VARCHAR,
        museum_name VARCHAR,
        summary VARCHAR,
        analysis TEXT,
        params JSONB,
        is_recognized INTEGER DEFAULT 1,
        device_id VARCHAR,
        user_id VARCHAR REFERENCES users(user_id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        movement VARCHAR,
        period_bucket VARCHAR,
        reference_urls JSONB,
        artwork_entity_id VARCHAR REFERENCES artwork_entities(id) ON DELETE SET NULL,
        artist_entity_id VARCHAR REFERENCES artist_entities(id) ON DELETE SET NULL,
        insights JSONB,
        classification VARCHAR(20) NOT NULL DEFAULT 'unsorted',
        classification_updated_at TIMESTAMP,
        analysis_status VARCHAR(20) NOT NULL DEFAULT 'analyzed',
        analysis_error TEXT,
        analysis_attempted_at TIMESTAMP,
        analysis_completed_at TIMESTAMP
    )
    """,
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS movement VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS period_bucket VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS reference_urls JSONB",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS thumbnail_uri VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artwork_entity_id VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artist_entity_id VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS insights JSONB",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification VARCHAR(20) NOT NULL DEFAULT 'unsorted'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification_updated_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(20) NOT NULL DEFAULT 'analyzed'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_error TEXT",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_attempted_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_user_id ON saved_artworks(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_device_id ON saved_artworks(device_id)",
    "CREATE INDEX IF NOT EXISTS ix_saved_artworks_artwork_entity_id ON saved_artworks(artwork_entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_saved_artworks_artist_entity_id ON saved_artworks(artist_entity_id)",
    """
    CREATE TABLE IF NOT EXISTS collections (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        description VARCHAR,
        user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS collection_artworks (
        collection_id VARCHAR NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        artwork_id VARCHAR NOT NULL REFERENCES saved_artworks(id) ON DELETE CASCADE,
        PRIMARY KEY (collection_id, artwork_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tags (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL UNIQUE,
        explanation TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_tags_name ON tags(name)",
    """
    CREATE TABLE IF NOT EXISTS artwork_tags (
        artwork_id VARCHAR NOT NULL REFERENCES saved_artworks(id) ON DELETE CASCADE,
        tag_id VARCHAR NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (artwork_id, tag_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR,
        user_title VARCHAR,
        system_title VARCHAR,
        title_state VARCHAR(20) NOT NULL DEFAULT 'draft',
        narrative_summary TEXT,
        metadata_json JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    """,
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_title VARCHAR",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS system_title VARCHAR",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title_state VARCHAR(20) NOT NULL DEFAULT 'draft'",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS narrative_summary TEXT",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS metadata_json JSONB",
    """
    CREATE TABLE IF NOT EXISTS session_artworks (
        id VARCHAR PRIMARY KEY,
        session_id VARCHAR NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        artwork_id VARCHAR NOT NULL REFERENCES saved_artworks(id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL DEFAULT 0,
        source VARCHAR(20) NOT NULL DEFAULT 'library',
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_session_artwork UNIQUE (session_id, artwork_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_session_artworks_session_sequence ON session_artworks(session_id, sequence_number)",
    "CREATE INDEX IF NOT EXISTS idx_session_artworks_artwork_id ON session_artworks(artwork_id)",
    """
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
    """,
    """
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
    """,
    "CREATE INDEX IF NOT EXISTS ix_session_events_session_id ON session_events(session_id)",
    """
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
    """,
    "ALTER TABLE session_events ADD COLUMN IF NOT EXISTS trigger_event_id VARCHAR",
    "ALTER TABLE session_events ADD COLUMN IF NOT EXISTS payload JSONB",
    "ALTER TABLE session_events ALTER COLUMN payload TYPE JSONB USING payload::jsonb",
    """
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
    """,
    """
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
    """,
    """
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
    """,
    "ALTER TABLE artwork_events ADD COLUMN IF NOT EXISTS trigger_event_id VARCHAR",
    "ALTER TABLE artwork_events ALTER COLUMN payload TYPE JSONB USING payload::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_artwork_events_artwork_created ON artwork_events(artwork_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_artwork_events_session_created ON artwork_events(trigger_session_id, created_at)",
    """
    CREATE TABLE IF NOT EXISTS ai_usage (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        model VARCHAR,
        subject_type VARCHAR(50),
        subject_id VARCHAR,
        input_tokens INTEGER,
        output_tokens INTEGER,
        error_message TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_user_started ON ai_usage(user_id, started_at)",
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_subject ON ai_usage(subject_type, subject_id)",
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_job_status ON ai_usage(job_type, status)",
    """
    CREATE TABLE IF NOT EXISTS public_comments (
        id VARCHAR PRIMARY KEY,
        entity_id VARCHAR NOT NULL REFERENCES artwork_entities(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_public_comments_entity_id ON public_comments(entity_id)",
    """
    CREATE TABLE IF NOT EXISTS skill_events (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        artwork_id VARCHAR REFERENCES saved_artworks(id) ON DELETE SET NULL,
        skill_name VARCHAR NOT NULL,
        skill_cat VARCHAR NOT NULL DEFAULT 'PERCEPTION',
        event_type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
    "ALTER TABLE skill_events ADD COLUMN IF NOT EXISTS skill_cat VARCHAR NOT NULL DEFAULT 'PERCEPTION'",
    "CREATE INDEX IF NOT EXISTS ix_skill_events_user_id ON skill_events(user_id)",
    """
    CREATE TABLE IF NOT EXISTS taste_profiles (
        user_id VARCHAR PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'not_ready',
        eligible_count INTEGER NOT NULL DEFAULT 0,
        required_count INTEGER NOT NULL DEFAULT 5,
        love_count INTEGER NOT NULL DEFAULT 0,
        reject_count INTEGER NOT NULL DEFAULT 0,
        respect_count INTEGER NOT NULL DEFAULT 0,
        is_outdated INTEGER NOT NULL DEFAULT 0,
        generated_at TIMESTAMP,
        outdated_at TIMESTAMP,
        love_vector JSONB,
        reject_vector JSONB,
        taste_vector JSONB,
        source_artwork_ids JSONB,
        narrative_summary TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    """,
)


def run() -> None:
    url = os.environ.get("DATABASE_URL") or settings.effective_database_url
    masked_url = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", url)
    print(f"Target DB: {masked_url[:80]}...")
    engine = create_engine(url)

    with engine.begin() as conn:
        for statement in STATEMENTS:
            conn.execute(text(statement))

    print("✓ runtime schema tables and columns are ready")


if __name__ == "__main__":
    run()
