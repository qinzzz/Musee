"""
Create the journals table for persistent daily journal snapshots.

Run against DEV:
    python migrations/20260722_journals.py

Run against PROD:
    ENV=prod python migrations/20260722_journals.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


def main() -> None:
    engine = create_engine(settings.effective_database_url)
    with engine.begin() as conn:
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS journals (
                id VARCHAR PRIMARY KEY,
                user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                local_date DATE NOT NULL,
                timezone VARCHAR(100) NOT NULL,
                period_start_utc TIMESTAMP NOT NULL,
                period_end_utc TIMESTAMP NOT NULL,
                title VARCHAR(160),
                reflection TEXT NOT NULL,
                focuses JSONB NOT NULL DEFAULT '[]'::jsonb,
                narrative_arc TEXT,
                representative_artwork_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
                evidence_snapshot JSONB NOT NULL,
                evidence_schema_version VARCHAR(50) NOT NULL,
                source_event_count INTEGER NOT NULL,
                input_hash VARCHAR(64) NOT NULL,
                prompt_version VARCHAR(50) NOT NULL,
                model_version VARCHAR(100) NOT NULL,
                generated_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_journals_user_local_date UNIQUE (user_id, local_date)
            )
            """
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_journals_user_local_date "
            "ON journals(user_id, local_date)"
        ))
    print("journals table ready")


if __name__ == "__main__":
    main()
