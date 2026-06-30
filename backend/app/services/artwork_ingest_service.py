from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
from typing import Any, Dict, Optional, Union

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, User
from app.services.artwork_analysis_service import batch_link_tags
from app.services.artwork_event_service import (
    ARTWORK_EVENT_ADDED_TO_SESSION,
    ARTWORK_EVENT_CREATED,
    log_artwork_event,
)
from app.services.session_service import (
    coerce_location_payload as _coerce_location_payload,
    ensure_session_artwork_link as _ensure_session_artwork_link,
    get_or_create_owned_session as _get_or_create_owned_session,
    refresh_session_title as _refresh_session_title,
)
from app.services.artwork_entity_service import upsert_artist_entity, upsert_artwork_entity
from app.utils.image_processing import reverse_geocode

logger = logging.getLogger(__name__)


def location_payload_needs_resolution(location: Optional[Union[str, Dict[str, Any]]]) -> bool:
    payload = _coerce_location_payload(location)
    if not payload:
        return False

    has_coords = payload.get("latitude") is not None and payload.get("longitude") is not None
    has_resolved_fields = any(
        isinstance(payload.get(key), str) and payload.get(key).strip()
        for key in ("city", "country", "museum", "raw")
    )
    return has_coords and not has_resolved_fields


async def resolve_location_payload(
    location: Optional[Union[str, Dict[str, Any]]],
    latitude: Optional[float],
    longitude: Optional[float],
) -> Optional[str]:
    payload = _coerce_location_payload(location)
    coords_lat = latitude if latitude is not None else (payload.get("latitude") if payload else None)
    coords_lon = longitude if longitude is not None else (payload.get("longitude") if payload else None)

    if location_payload_needs_resolution(payload) and coords_lat is not None and coords_lon is not None:
        location_data = await reverse_geocode(coords_lat, coords_lon)
        location_data["latitude"] = coords_lat
        location_data["longitude"] = coords_lon
        return json.dumps(location_data)

    if location is not None:
        if isinstance(location, dict):
            return json.dumps(location)
        return str(location)

    if coords_lat is not None and coords_lon is not None:
        location_data = await reverse_geocode(coords_lat, coords_lon)
        location_data["latitude"] = coords_lat
        location_data["longitude"] = coords_lon
        return json.dumps(location_data)

    return None


def parse_location_value(location: Optional[Union[str, Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    if location and isinstance(location, str):
        try:
            return json.loads(location) if location.strip().startswith("{") else {"raw": location}
        except Exception:
            return {"raw": location}
    if isinstance(location, dict):
        return location
    return None


def create_saved_artwork_record_sync(
    user_id: Optional[str],
    session_id: Optional[str],
    photo_uri: str,
    location: Optional[Dict[str, Any]],
    photo_time: Optional[str],
    source: str = "upload",
    sequence_number: Optional[int] = None,
) -> str:
    with SessionLocal() as local_db:
        session = _get_or_create_owned_session(
            local_db,
            user_id=user_id,
            session_id=session_id,
            create_if_missing_id=False,
        )
        artwork = SavedArtwork(
            photo_uri=photo_uri,
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            user_id=user_id,
            is_recognized=0,
            analysis=None,
            params={},
            location=location,
            photo_time=photo_time,
            analysis_status="pending",
            analysis_error=None,
        )
        local_db.add(artwork)
        local_db.commit()
        local_db.refresh(artwork)
        log_artwork_event(
            local_db,
            artwork_id=str(artwork.id),
            event_type=ARTWORK_EVENT_CREATED,
            actor_role="system",
            trigger_source=source,
            trigger_session_id=session_id,
            payload={
                "photo_uri": photo_uri,
                "has_location": bool(location),
                "photo_time": photo_time,
            },
        )

        link = _ensure_session_artwork_link(
            local_db,
            session_id=session_id,
            artwork_id=str(artwork.id),
            source=source,
            sequence_number=sequence_number,
        )
        if link and session_id:
            log_artwork_event(
                local_db,
                artwork_id=str(artwork.id),
                event_type=ARTWORK_EVENT_ADDED_TO_SESSION,
                actor_role="system",
                trigger_source=source,
                trigger_session_id=session_id,
                payload={
                    "session_id": session_id,
                    "source": source,
                    "sequence_number": link.sequence_number,
                },
            )
        if session:
            local_db.flush()
            _refresh_session_title(local_db, session)
        local_db.commit()

        return str(artwork.id)


def save_analyzed_artwork_record_sync(
    user_id: str,
    session_id: Optional[str],
    photo_uri: str,
    parsed_result: Dict[str, Any],
    location: Optional[Dict[str, Any]],
    photo_time: Optional[str],
    vision_ref_urls: Optional[list[str]],
    source: str = "upload",
) -> tuple[str, Optional[str], Optional[str], Optional[str]]:
    with SessionLocal() as local_db:
        user = local_db.query(User).filter(User.user_id == user_id).first()
        if not user:
            user = User(user_id=user_id, device_id=user_id)
            local_db.add(user)
            local_db.flush()

        session_record = _get_or_create_owned_session(
            local_db,
            user_id=user_id,
            session_id=session_id,
            create_if_missing_id=False,
        )
        artwork = SavedArtwork(
            photo_uri=photo_uri,
            artist_name=parsed_result["artist_name"],
            artwork_name=parsed_result["artwork_name"],
            user_id=user_id,
            is_recognized=1 if parsed_result["artist_name"] != "Unknown Artist" else 0,
            analysis=parsed_result["analysis"],
            params={
                "date": parsed_result["date"],
                "medium": parsed_result["medium"],
            },
            location=location,
            photo_time=photo_time,
            movement=parsed_result["movement"],
            period_bucket=parsed_result["period_bucket"],
            reference_urls=vision_ref_urls or [],
            analysis_status="analyzed",
            analysis_error=None,
            analysis_completed_at=datetime.now(UTC),
        )
        local_db.add(artwork)
        try:
            local_db.flush()
            if parsed_result.get("tags"):
                batch_link_tags(local_db, artwork, parsed_result["tags"])
            local_db.commit()
        except Exception as exc:
            if "reference_urls" in str(exc):
                local_db.rollback()
                artwork.reference_urls = None
                local_db.add(artwork)
                local_db.flush()
                if parsed_result.get("tags"):
                    batch_link_tags(local_db, artwork, parsed_result["tags"])
                local_db.commit()
            else:
                raise
        local_db.refresh(artwork)
        log_artwork_event(
            local_db,
            artwork_id=str(artwork.id),
            event_type=ARTWORK_EVENT_CREATED,
            actor_role="system",
            trigger_source=source,
            trigger_session_id=session_id,
            payload={
                "photo_uri": photo_uri,
                "has_location": bool(location),
                "photo_time": photo_time,
                "recognized": artwork.is_recognized == 1,
            },
        )

        link = _ensure_session_artwork_link(
            local_db,
            session_id=session_id,
            artwork_id=str(artwork.id),
            source=source,
        )
        if link and session_id:
            log_artwork_event(
                local_db,
                artwork_id=str(artwork.id),
                event_type=ARTWORK_EVENT_ADDED_TO_SESSION,
                actor_role="system",
                trigger_source=source,
                trigger_session_id=session_id,
                payload={
                    "session_id": session_id,
                    "source": source,
                    "sequence_number": link.sequence_number,
                },
            )
        if session_record:
            local_db.flush()
            _refresh_session_title(local_db, session_record)
        local_db.commit()

        entity_id_for_analysis = None
        artist_entity_id_for_bio = None
        linked_artist_entity_id = None
        if (
            parsed_result["artist_name"]
            and parsed_result["artist_name"] != "Unknown Artist"
            and parsed_result["artwork_name"]
        ):
            try:
                with local_db.begin_nested():
                    entity = upsert_artwork_entity(
                        local_db,
                        parsed_result["artist_name"],
                        parsed_result["artwork_name"],
                    )
                    artist_entity = upsert_artist_entity(local_db, parsed_result["artist_name"])
                    local_db.flush()
                    artwork.artwork_entity_id = entity.id
                    artwork.artist_entity_id = artist_entity.id
                local_db.commit()
                linked_artist_entity_id = artist_entity.id
                if entity.dim_status in (None, "pending"):
                    entity_id_for_analysis = entity.id
                if artist_entity.bio_status in (None, "pending"):
                    artist_entity_id_for_bio = artist_entity.id
            except Exception as exc:
                logger.warning("Entity upsert failed in unified save: %s", exc)

        return (
            str(artwork.id),
            entity_id_for_analysis,
            artist_entity_id_for_bio,
            linked_artist_entity_id,
        )
