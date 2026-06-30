from __future__ import annotations

import uuid as uuid_mod
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database.models import ArtworkEvent

import logging

logger = logging.getLogger(__name__)


ARTWORK_EVENT_CREATED = "artwork_created"
ARTWORK_EVENT_METADATA_UPDATED = "artwork_metadata_updated"
ARTWORK_EVENT_ADDED_TO_SESSION = "artwork_added_to_session"
ARTWORK_EVENT_IDENTIFICATION_REQUESTED = "artwork_identification_requested"
ARTWORK_EVENT_IDENTIFICATION_COMPLETED = "artwork_identification_completed"
ARTWORK_EVENT_IDENTIFICATION_FAILED = "artwork_identification_failed"
ARTWORK_EVENT_REIDENTIFICATION_REQUESTED = "artwork_reidentification_requested"
ARTWORK_EVENT_REIDENTIFICATION_COMPLETED = "artwork_reidentification_completed"
ARTWORK_EVENT_REIDENTIFICATION_FAILED = "artwork_reidentification_failed"

_artwork_events_schema_ready = False


def ensure_artwork_events_schema(db: Session) -> bool:
    """Best-effort safety net for production deploys before manual migrations.

    Artwork events are product telemetry/history. They should never make the
    primary artwork upload/analyze path fail if the table has not been created
    yet. Bootstrap/migrations still own schema setup; this guard prevents a bad
    deploy order from taking down uploads.
    """
    global _artwork_events_schema_ready
    if _artwork_events_schema_ready:
        return True

    bind = db.get_bind()
    if "sqlite" in str(bind.url):
        _artwork_events_schema_ready = True
        return True

    try:
        with bind.begin() as conn:
            conn.execute(text("""
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
            conn.execute(text("""
                ALTER TABLE artwork_events
                    ALTER COLUMN payload TYPE JSONB USING payload::jsonb
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_artwork_events_artwork_created
                ON artwork_events(artwork_id, created_at)
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_artwork_events_session_created
                ON artwork_events(trigger_session_id, created_at)
            """))
        _artwork_events_schema_ready = True
        return True
    except SQLAlchemyError as exc:
        logger.warning("Artwork event schema unavailable; skipping event log: %s", exc)
        return False


def log_artwork_event(
    db: Session,
    *,
    artwork_id: str,
    event_type: str,
    actor_role: str = "system",
    trigger_source: Optional[str] = None,
    trigger_session_id: Optional[str] = None,
    trigger_event_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Optional[ArtworkEvent]:
    if not ensure_artwork_events_schema(db):
        return None

    event = ArtworkEvent(
        id=str(uuid_mod.uuid4()),
        artwork_id=artwork_id,
        event_type=event_type,
        actor_role=actor_role,
        trigger_source=trigger_source,
        trigger_session_id=trigger_session_id,
        trigger_event_id=trigger_event_id,
        parent_event_id=parent_event_id,
        payload=payload or None,
    )
    db.add(event)
    return event


def build_metadata_update_payload(
    *,
    before: Dict[str, Any],
    after: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    updated_fields = sorted(
        field_name
        for field_name in sorted(set(before.keys()) | set(after.keys()))
        if before.get(field_name) != after.get(field_name)
    )
    if not updated_fields:
        return None
    return {
        "updated_fields": updated_fields,
        "before": {field_name: before.get(field_name) for field_name in updated_fields},
        "after": {field_name: after.get(field_name) for field_name in updated_fields},
    }
