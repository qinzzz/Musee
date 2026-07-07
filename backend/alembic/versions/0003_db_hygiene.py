"""Enforce the session-event ordering invariant and fix index hygiene.

- UNIQUE (session_id, sequence_number) on session_events: the invariant
  the event-ordering architecture (client and server) already assumes;
  previously enforced only by application behavior.
- Index sessions (user_id, updated_at) and collections (user_id): the
  two hottest list queries filtered unindexed columns (Postgres does not
  auto-index FKs).
- Drop leftovers from the session_messages rename and a doubled
  saved_artworks index; rename the stale session_messages_pkey.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # SQLite (tests) gets all of this from create_all on the models.

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_session_events_session_sequence "
        "ON session_events (session_id, sequence_number)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions (user_id, updated_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections (user_id)"
    )
    # Rename-era leftover; ix_session_events_session_id remains.
    op.execute("DROP INDEX IF EXISTS ix_session_messages_session_id")
    # Doubled with ix_saved_artworks_artist_entity_id.
    op.execute("DROP INDEX IF EXISTS idx_saved_artworks_artist_entity_id")
    # Cosmetic: the PK still carries the pre-rename table name.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'session_messages_pkey') THEN
                ALTER INDEX session_messages_pkey RENAME TO session_events_pkey;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_session_events_session_sequence")
    op.execute("DROP INDEX IF EXISTS idx_sessions_user_updated")
    op.execute("DROP INDEX IF EXISTS idx_collections_user_id")
