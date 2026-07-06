"""
Schema cleanup: drop the legacy session_messages table

Background:
- The messages→events migration renamed session_messages to session_events
  when possible. On databases where session_events was created fresh, the old
  session_messages table was left behind with pre-rename ("visit"-era) rows
  that no application code has read or written since 2026-06-28.

Safety:
- The drop is guarded: it only runs when session_events also exists. On a
  database that never migrated (session_messages is still the live table),
  this script is a no-op — bootstrap's rename handles that case first.

Changes:
1. DROP TABLE session_messages (guarded)

Run against DEV:
    python migrations/20260704_drop_legacy_session_messages.py

Run against PROD:
    ENV=prod python migrations/20260704_drop_legacy_session_messages.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import create_engine, text

from app.config.settings import settings


def main() -> None:
    engine = create_engine(settings.effective_database_url)
    with engine.begin() as conn:
        has_legacy = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'session_messages')"
        )).scalar()
        has_canonical = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'session_events')"
        )).scalar()

        if not has_legacy:
            print("session_messages does not exist — nothing to do.")
            return
        if not has_canonical:
            print("session_events missing — session_messages may still be the "
                  "live table; refusing to drop. Run the rename migration first.")
            return

        rows = conn.execute(text("SELECT count(*) FROM session_messages")).scalar()
        conn.execute(text("DROP TABLE session_messages"))
        print(f"Dropped legacy session_messages ({rows} unreachable pre-rename rows).")


if __name__ == "__main__":
    main()
