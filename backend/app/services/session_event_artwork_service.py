from __future__ import annotations

import uuid as uuid_mod
from typing import Iterable, List

from sqlalchemy.orm import Session

from app.database.models import SessionEventArtwork, SessionEvent


def normalize_session_event_artwork_ids(
    *,
    artwork_id: str | None,
    artwork_ids: Iterable[str] | None,
) -> List[str]:
    normalized: List[str] = []
    seen: set[str] = set()

    def _push(value: str | None) -> None:
        candidate = (value or "").strip()
        if not candidate or candidate in seen:
            return
        normalized.append(candidate)
        seen.add(candidate)

    _push(artwork_id)
    if artwork_ids:
        for value in artwork_ids:
            _push(value)
    return normalized


def sync_session_event_artworks(
    db: Session,
    *,
    session_event: SessionEvent,
    artwork_ids: List[str],
    role: str = "subject",
) -> int:
    normalized_artwork_ids = normalize_session_event_artwork_ids(
        artwork_id=session_event.artwork_id,
        artwork_ids=artwork_ids,
    )
    existing_links = (
        db.query(SessionEventArtwork)
        .filter(SessionEventArtwork.session_event_id == session_event.id)
        .all()
    )
    existing_by_artwork_id = {
        link.artwork_id: link
        for link in existing_links
        if link.artwork_id
    }
    kept_ids = set(normalized_artwork_ids)

    for link in existing_links:
        if link.artwork_id not in kept_ids:
            db.delete(link)

    inserted = 0
    for position, artwork_id in enumerate(normalized_artwork_ids):
        existing = existing_by_artwork_id.get(artwork_id)
        if existing:
            existing.role = role
            existing.position = position
            continue
        db.add(SessionEventArtwork(
            id=str(uuid_mod.uuid4()),
            session_event_id=session_event.id,
            artwork_id=artwork_id,
            role=role,
            position=position,
        ))
        inserted += 1

    session_event.artwork_id = normalized_artwork_ids[0] if normalized_artwork_ids else None

    return inserted
