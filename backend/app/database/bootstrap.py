from __future__ import annotations

import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)

SCHEMA_BOOTSTRAP_STATEMENTS = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_stats JSONB",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS reference_urls JSONB",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artwork_entity_id VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artist_entity_id VARCHAR",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS insights JSONB",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification VARCHAR(20) NOT NULL DEFAULT 'unsorted'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification_updated_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(20) NOT NULL DEFAULT 'analyzed'",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_error TEXT",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_attempted_at TIMESTAMP",
    "ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS analysis_completed_at TIMESTAMP",
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
    "CREATE INDEX IF NOT EXISTS idx_session_artworks_session_sequence ON session_artworks(session_id, sequence_number)",
    "CREATE INDEX IF NOT EXISTS idx_session_artworks_artwork_id ON session_artworks(artwork_id)",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_user_id ON saved_artworks(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_saved_artworks_device_id ON saved_artworks(device_id)",
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
