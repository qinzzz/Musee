from __future__ import annotations

import uuid as uuid_mod
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.database.models import ArtworkEvent


ARTWORK_EVENT_CREATED = "artwork_created"
ARTWORK_EVENT_METADATA_UPDATED = "artwork_metadata_updated"
ARTWORK_EVENT_ADDED_TO_SESSION = "artwork_added_to_session"
ARTWORK_EVENT_IDENTIFICATION_REQUESTED = "artwork_identification_requested"
ARTWORK_EVENT_IDENTIFICATION_COMPLETED = "artwork_identification_completed"
ARTWORK_EVENT_IDENTIFICATION_FAILED = "artwork_identification_failed"
ARTWORK_EVENT_REIDENTIFICATION_REQUESTED = "artwork_reidentification_requested"
ARTWORK_EVENT_REIDENTIFICATION_COMPLETED = "artwork_reidentification_completed"
ARTWORK_EVENT_REIDENTIFICATION_FAILED = "artwork_reidentification_failed"


def log_artwork_event(
    db: Session,
    *,
    artwork_id: str,
    event_type: str,
    actor_role: str = "system",
    trigger_source: Optional[str] = None,
    trigger_session_id: Optional[str] = None,
    turn_id: Optional[str] = None,
    parent_event_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> ArtworkEvent:
    event = ArtworkEvent(
        id=str(uuid_mod.uuid4()),
        artwork_id=artwork_id,
        event_type=event_type,
        actor_role=actor_role,
        trigger_source=trigger_source,
        trigger_session_id=trigger_session_id,
        turn_id=turn_id,
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
