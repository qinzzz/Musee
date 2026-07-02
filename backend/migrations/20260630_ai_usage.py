"""
Create ai_usage table for best-effort AI usage telemetry.

Run against DEV:
    python migrations/20260630_ai_usage.py

Run against PROD:
    ENV=prod python migrations/20260630_ai_usage.py
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
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ai_usage_user_started
            ON ai_usage(user_id, started_at)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ai_usage_subject
            ON ai_usage(subject_type, subject_id)
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_ai_usage_job_status
            ON ai_usage(job_type, status)
        """))
        conn.commit()

    print("✓ ai_usage table ready")


if __name__ == "__main__":
    run()
