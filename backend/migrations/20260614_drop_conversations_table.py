"""
Schema cleanup: drop legacy conversations table

Prerequisite:
- Application code must no longer read or write the legacy Conversation model.

Changes:
1. DROP TABLE conversations

Run against DEV:
    python migrations/20260614_drop_conversations_table.py

Run against PROD:
    ENV=prod python migrations/20260614_drop_conversations_table.py
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
            DROP TABLE IF EXISTS conversations CASCADE
        """))
        conn.commit()

    print("✓ dropped conversations table")


if __name__ == "__main__":
    run()
