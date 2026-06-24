from __future__ import annotations

from sqlalchemy import text

from app.database.connection import engine


def run_legacy_migrations() -> dict:
    with engine.connect() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_stats JSONB"))
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS skill_events (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR NOT NULL,
                    artwork_id VARCHAR,
                    skill_name VARCHAR NOT NULL,
                    event_type VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
                """
            )
        )
        connection.execute(
            text(
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
                    UNIQUE (canonical_artist, canonical_title)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public_comments (
                    id VARCHAR PRIMARY KEY,
                    entity_id VARCHAR NOT NULL REFERENCES artwork_entities(id) ON DELETE CASCADE,
                    user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE saved_artworks
                ADD COLUMN IF NOT EXISTS artwork_entity_id VARCHAR
                REFERENCES artwork_entities(id) ON DELETE SET NULL
                """
            )
        )
        for column, column_type in [
            ("dim_figurative_abstract", "SMALLINT"),
            ("dim_emotive_conceptual", "SMALLINT"),
            ("dim_serene_intense", "SMALLINT"),
            ("dim_classical_avantgarde", "SMALLINT"),
            ("dim_playful_serious", "SMALLINT"),
            ("dim_status", "VARCHAR(20) DEFAULT 'pending'"),
            ("dim_analyzed_at", "TIMESTAMP"),
            ("dim_error", "TEXT"),
        ]:
            connection.execute(
                text(f"ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS {column} {column_type}")
            )
        connection.commit()
    return {"status": "ok", "message": "Migrations applied"}
