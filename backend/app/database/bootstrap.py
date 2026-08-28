from __future__ import annotations

import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)

SCHEMA_BOOTSTRAP_STATEMENTS = (
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
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_stats JSONB",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS reference_urls JSONB",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artwork_entity_id VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artist_entity_id VARCHAR",
    """
    CREATE TABLE IF NOT EXISTS museum_entities (
        id VARCHAR PRIMARY KEY,
        canonical_name VARCHAR NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        country_code VARCHAR(2),
        wikidata_qid VARCHAR,
        osm_type VARCHAR(20),
        osm_id VARCHAR,
        is_physical_venue BOOLEAN NOT NULL DEFAULT TRUE,
        resolution_eligible BOOLEAN NOT NULL DEFAULT TRUE,
        has_child_venues BOOLEAN NOT NULL DEFAULT FALSE,
        parent_wikidata_qid VARCHAR,
        validation_source VARCHAR(30),
        validated_at TIMESTAMP,
        footprint_geojson JSONB,
        footprint_min_latitude DOUBLE PRECISION,
        footprint_max_latitude DOUBLE PRECISION,
        footprint_min_longitude DOUBLE PRECISION,
        footprint_max_longitude DOUBLE PRECISION,
        footprint_source VARCHAR(30),
        footprint_license VARCHAR(30),
        footprint_updated_at TIMESTAMP,
        thumbnail_file_name VARCHAR,
        thumbnail_url VARCHAR,
        thumbnail_source VARCHAR(30),
        thumbnail_source_url VARCHAR,
        thumbnail_attribution TEXT,
        thumbnail_license VARCHAR,
        thumbnail_updated_at TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_museum_entities_wikidata_qid UNIQUE (wikidata_qid),
        CONSTRAINT uq_museum_entities_osm_identity UNIQUE (osm_type, osm_id)
    )
    """,
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS osm_type VARCHAR(20)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS osm_id VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS is_physical_venue BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS resolution_eligible BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS has_child_venues BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS parent_wikidata_qid VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS validation_source VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_geojson JSONB",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_min_latitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_max_latitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_min_longitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_max_longitude DOUBLE PRECISION",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_source VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_license VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS footprint_updated_at TIMESTAMP",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_file_name VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_source VARCHAR(30)",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_source_url VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_attribution TEXT",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_license VARCHAR",
    "ALTER TABLE museum_entities ADD COLUMN IF NOT EXISTS thumbnail_updated_at TIMESTAMP",
    """
    ALTER TABLE saved_artworks
    ADD COLUMN IF NOT EXISTS capture_museum_entity_id VARCHAR
    REFERENCES museum_entities(id) ON DELETE SET NULL
    """,
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS insights JSONB",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification VARCHAR(20) NOT NULL DEFAULT 'unsorted'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification_updated_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(20) NOT NULL DEFAULT 'analyzed'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_error TEXT",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_attempted_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_title VARCHAR",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS system_title VARCHAR",
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title_state VARCHAR(20) NOT NULL DEFAULT 'draft'",
    """
    UPDATE saved_artworks
    SET analysis_status = CASE
        WHEN COALESCE(analysis_status, '') = '' AND analysis IS NOT NULL THEN 'analyzed'
        WHEN COALESCE(analysis_status, '') = '' THEN 'pending'
        ELSE analysis_status
    END
    """,
    """
    UPDATE sessions
    SET system_title = COALESCE(NULLIF(system_title, ''), NULLIF(title, ''), 'Untitled Session')
    WHERE COALESCE(system_title, '') = ''
    """,
    """
    UPDATE sessions
    SET title = COALESCE(NULLIF(user_title, ''), NULLIF(system_title, ''), NULLIF(title, ''), 'Untitled Session')
    WHERE COALESCE(title, '') = ''
       OR title IS DISTINCT FROM COALESCE(NULLIF(user_title, ''), NULLIF(system_title, ''), NULLIF(title, ''), 'Untitled Session')
    """,
    """
    UPDATE sessions
    SET title_state = CASE
        WHEN COALESCE(NULLIF(user_title, ''), '') <> '' THEN 'user_locked'
        WHEN COALESCE(NULLIF(system_title, ''), 'Untitled Session') = 'Untitled Session' THEN 'draft'
        ELSE 'auto'
    END
    WHERE COALESCE(title_state, '') = ''
       OR title_state NOT IN ('draft', 'auto', 'user_locked')
    """,
    """
    CREATE TABLE IF NOT EXISTS skill_events (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL,
        artwork_id VARCHAR,
        skill_name VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    )
    """,
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
        generated_at TIMESTAMP NULL,
        outdated_at TIMESTAMP NULL,
        love_vector JSONB NULL,
        reject_vector JSONB NULL,
        taste_vector JSONB NULL,
        source_artwork_ids JSONB NULL,
        narrative_summary TEXT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
    """,
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
    """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'session_event_artworks'
        ) THEN
            DROP TABLE session_event_artworks;
        END IF;
    END
    $$;
    """,
    "CREATE INDEX IF NOT EXISTS idx_session_artworks_session_sequence ON session_artworks(session_id, sequence_number)",
    "CREATE INDEX IF NOT EXISTS idx_session_artworks_artwork_id ON session_artworks(artwork_id)",
    "CREATE INDEX IF NOT EXISTS idx_artwork_events_artwork_created ON artwork_events(artwork_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_artwork_events_session_created ON artwork_events(trigger_session_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_user_started ON ai_usage(user_id, started_at)",
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_subject ON ai_usage(subject_type, subject_id)",
    "CREATE INDEX IF NOT EXISTS idx_ai_usage_job_status ON ai_usage(job_type, status)",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_user_id ON saved_artworks(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_device_id ON saved_artworks(device_id)",
    "CREATE INDEX IF NOT EXISTS idx_museum_entities_coordinates ON museum_entities(latitude, longitude)",
    "CREATE INDEX IF NOT EXISTS idx_museum_entities_country ON museum_entities(country_code)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_museum_entities_osm_identity ON museum_entities(osm_type, osm_id)",
    "CREATE INDEX IF NOT EXISTS ix_museum_entities_parent_wikidata_qid ON museum_entities(parent_wikidata_qid)",
    "CREATE INDEX IF NOT EXISTS ix_saved_artworks_capture_museum_entity_id ON saved_artworks(capture_museum_entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_saved_artworks_user_museum_active ON saved_artworks(user_id, capture_museum_entity_id) WHERE deleted_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_active_user_created ON saved_artworks(user_id, created_at DESC) WHERE deleted_at IS NULL",
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
)


def initialize_database(engine, base) -> None:
    base.metadata.create_all(bind=engine)

    is_sqlite = "sqlite" in str(engine.url)
    if is_sqlite:
        logger.info("Database initialized")
        return

    with engine.connect() as conn:
        for statement in SCHEMA_BOOTSTRAP_STATEMENTS:
            conn.execute(text(statement))
        conn.commit()

    logger.info("Database initialized and migrations applied")
