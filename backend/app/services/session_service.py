from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
import json
import logging
import re
import uuid as uuid_mod
from typing import Any, Dict, List, Optional, Union

import anyio
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionMessage, User
from app.models.artwork import AIProvider
from app.services.ai_service import AIServiceFactory

logger = logging.getLogger(__name__)

SESSION_ARTWORK_LIMIT = 5
DEFAULT_SESSION_TITLE = "Untitled Session"
SESSION_TITLE_STATE_DRAFT = "draft"
SESSION_TITLE_STATE_AUTO = "auto"
SESSION_TITLE_STATE_USER_LOCKED = "user_locked"
TITLE_REASON_FALLBACK = "fallback"
TITLE_REASON_THEME = "theme"
TITLE_REASON_ARTIST = "artist"
TITLE_REASON_VENUE = "venue"
TITLE_REASON_GOAL = "goal"
TITLE_REASON_ARTWORK = "artwork"
TITLE_REASON_RANK = {
    TITLE_REASON_THEME: 1,
    TITLE_REASON_ARTIST: 2,
    TITLE_REASON_ARTWORK: 3,
    TITLE_REASON_VENUE: 4,
    TITLE_REASON_GOAL: 5,
    TITLE_REASON_FALLBACK: 9,
}


def normalize_session_title(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value).strip().strip("\"'")
    return normalized or None


def humanize_session_label(value: Optional[str]) -> Optional[str]:
    normalized = normalize_session_title(value)
    if not normalized:
        return None
    normalized = normalized.lstrip("#").replace("_", " ").replace("-", " ")
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized.title() if normalized else None


def clean_goal_to_title(goal: Optional[str]) -> Optional[str]:
    normalized = normalize_session_title(goal)
    if not normalized:
        return None

    lowered = normalized.lower()
    for pattern in (
        r"^help me (understand|explore|analyze|find|figure out)\s+",
        r"^can you help me\s+",
        r"^i want to (understand|explore|find|learn|look at)\s+",
        r"^i'm trying to\s+",
        r"^im trying to\s+",
        r"^why do i like\s+",
        r"^how do i\s+",
    ):
        lowered = re.sub(pattern, "", lowered, count=1).strip()

    tokens = re.findall(r"[a-z0-9][a-z0-9'&-]*", lowered)
    if not tokens:
        return None

    stopwords = {
        "a", "an", "and", "are", "at", "for", "from", "i", "in", "is", "it",
        "me", "my", "of", "on", "or", "the", "this", "to", "what", "with", "why",
    }
    significant = [token for token in tokens if token not in stopwords]
    selected = significant[:4] if significant else tokens[:4]
    if not selected:
        return None
    return humanize_session_label(" ".join(selected))


def sync_session_display_title(session: SessionModel) -> None:
    effective_user_title = normalize_session_title(session.user_title)
    effective_system_title = normalize_session_title(session.system_title) or DEFAULT_SESSION_TITLE

    session.user_title = effective_user_title
    session.system_title = effective_system_title

    if effective_user_title:
        session.title = effective_user_title
        session.title_state = SESSION_TITLE_STATE_USER_LOCKED
    else:
        session.title = effective_system_title
        session.title_state = (
            SESSION_TITLE_STATE_DRAFT
            if effective_system_title == DEFAULT_SESSION_TITLE
            else SESSION_TITLE_STATE_AUTO
        )


def coerce_location_payload(location: Optional[Union[str, Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    if location is None:
        return None
    if isinstance(location, dict):
        return location
    if isinstance(location, str):
        try:
            if location.strip().startswith("{"):
                return json.loads(location)
            return {"raw": location}
        except Exception:
            return {"raw": location}
    return None


def derive_session_system_title(session: SessionModel) -> tuple[str, str]:
    goal = clean_goal_to_title((session.metadata_json or {}).get("user_goal"))
    first_user_message_title: Optional[str] = None
    for message in session.messages or []:
        if message.role != "user":
            continue
        if message.type != "text":
            continue
        first_user_message_title = clean_goal_to_title(message.content)
        if first_user_message_title:
            break

    movement_counts: Counter[str] = Counter()
    tag_counts: Counter[str] = Counter()
    artist_counts: Counter[str] = Counter()
    artwork_title_counts: Counter[str] = Counter()
    museum_counts: Counter[str] = Counter()
    city_counts: Counter[str] = Counter()

    linked_artworks = [link.artwork for link in session.artwork_links if link.artwork]
    artwork_count = len(linked_artworks)

    for artwork in linked_artworks:
        movement = humanize_session_label(artwork.movement)
        if movement:
            movement_counts[movement] += 1

        artist_name = normalize_session_title(artwork.artist_name)
        if artist_name and artist_name.lower() not in {"unknown artist", "unknown"}:
            artist_counts[artist_name] += 1

        artwork_name = normalize_session_title(artwork.artwork_name)
        if artwork_name and artwork_name.lower() not in {"untitled", "unknown"}:
            artwork_title_counts[artwork_name] += 1

        for tag in artwork.artwork_tags or []:
            tag_name = humanize_session_label(tag.name)
            if tag_name:
                tag_counts[tag_name] += 1

        location_payload = coerce_location_payload(artwork.location)
        museum_name = normalize_session_title(
            (location_payload or {}).get("museum") if location_payload else artwork.museum_name
        ) or normalize_session_title(artwork.museum_name)
        city_name = normalize_session_title((location_payload or {}).get("city") if location_payload else None)
        if museum_name:
            museum_counts[museum_name] += 1
        if city_name:
            city_counts[city_name] += 1

    top_movement = movement_counts.most_common(1)
    if top_movement and top_movement[0][1] >= 2:
        return top_movement[0][0], TITLE_REASON_THEME

    top_tag = tag_counts.most_common(1)
    if top_tag and top_tag[0][1] >= 2:
        return top_tag[0][0], TITLE_REASON_THEME

    top_artist = artist_counts.most_common(1)
    if top_artist and (artwork_count == 1 or top_artist[0][1] >= 2):
        return top_artist[0][0], TITLE_REASON_ARTIST

    top_artwork = artwork_title_counts.most_common(1)
    if top_artwork and artwork_count == 1:
        return top_artwork[0][0], TITLE_REASON_ARTWORK

    top_museum = museum_counts.most_common(1)
    if top_museum:
        return top_museum[0][0], TITLE_REASON_VENUE

    top_city = city_counts.most_common(1)
    if top_city:
        return top_city[0][0], TITLE_REASON_VENUE

    if goal:
        return goal, TITLE_REASON_GOAL
    if first_user_message_title:
        return first_user_message_title, TITLE_REASON_GOAL

    return DEFAULT_SESSION_TITLE, TITLE_REASON_FALLBACK


def is_material_title_upgrade(
    existing_reason: str,
    next_reason: str,
    existing_title: str,
    next_title: str,
) -> bool:
    if next_title == existing_title:
        return False
    if existing_title == DEFAULT_SESSION_TITLE and next_title != DEFAULT_SESSION_TITLE:
        return True
    return TITLE_REASON_RANK.get(next_reason, 99) < TITLE_REASON_RANK.get(existing_reason, 99)


def refresh_session_title(db: Session, session: Optional[SessionModel]) -> Optional[SessionModel]:
    if not session:
        return None

    metadata = dict(session.metadata_json or {})
    proposed_title, proposed_reason = derive_session_system_title(session)
    proposed_title = normalize_session_title(proposed_title) or DEFAULT_SESSION_TITLE

    current_system_title = normalize_session_title(session.system_title) or DEFAULT_SESSION_TITLE
    current_reason = metadata.get("title_reason") or TITLE_REASON_FALLBACK
    upgrade_count = int(metadata.get("title_auto_upgrade_count") or 0)

    if session.user_title:
        session.system_title = proposed_title
        metadata["title_reason"] = proposed_reason
    elif current_system_title == DEFAULT_SESSION_TITLE and proposed_title != DEFAULT_SESSION_TITLE:
        session.system_title = proposed_title
        metadata["title_reason"] = proposed_reason
    elif (
        proposed_title != current_system_title
        and upgrade_count < 1
        and is_material_title_upgrade(current_reason, proposed_reason, current_system_title, proposed_title)
    ):
        session.system_title = proposed_title
        metadata["title_reason"] = proposed_reason
        metadata["title_auto_upgrade_count"] = upgrade_count + 1
    else:
        session.system_title = current_system_title
        metadata["title_reason"] = current_reason

    session.metadata_json = metadata
    session.updated_at = datetime.now(UTC)
    sync_session_display_title(session)
    db.flush()
    return session


def session_has_meaningful_messages(db: Session, session_id: str) -> bool:
    return (
        db.query(SessionMessage.id)
        .filter(
            SessionMessage.session_id == session_id,
            SessionMessage.type == "text",
            SessionMessage.content.isnot(None),
            SessionMessage.content != "",
        )
        .first()
        is not None
    )


def should_delete_session_after_artwork_removal(db: Session, session_id: str) -> bool:
    remaining_links = (
        db.query(SessionArtwork.id)
        .filter(SessionArtwork.session_id == session_id)
        .count()
    )
    if remaining_links > 0:
        return False
    return not session_has_meaningful_messages(db, session_id)


def ensure_session_artwork_link(
    db: Session,
    session_id: Optional[str],
    artwork_id: Optional[str],
    source: str = "library",
    sequence_number: Optional[int] = None,
):
    if not session_id or not artwork_id:
        return None

    existing = db.query(SessionArtwork).filter(
        SessionArtwork.session_id == session_id,
        SessionArtwork.artwork_id == artwork_id,
    ).first()
    if existing:
        if sequence_number is not None:
            existing.sequence_number = sequence_number
        if source:
            existing.source = source
        return existing

    if sequence_number is None:
        sequence_number = (db.query(func.max(SessionArtwork.sequence_number)).filter(
            SessionArtwork.session_id == session_id
        ).scalar() or 0) + 1

    link = SessionArtwork(
        session_id=session_id,
        artwork_id=artwork_id,
        sequence_number=sequence_number,
        source=source,
    )
    db.add(link)
    return link


def ensure_user_record(db: Session, user_id: Optional[str]) -> Optional[User]:
    if not user_id:
        return None

    usr = db.query(User).filter(User.user_id == user_id).first()
    if not usr:
        usr = User(user_id=user_id, device_id=user_id)
        db.add(usr)
        db.flush()
    return usr


def get_or_create_owned_session(
    db: Session,
    user_id: Optional[str],
    session_id: Optional[str],
    requested_title: Optional[str] = None,
) -> Optional[SessionModel]:
    ensure_user_record(db, user_id)

    if not session_id:
        session_id = f"sess_{uuid_mod.uuid4().hex[:8]}"

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if session:
        sync_session_display_title(session)
        if user_id and session.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this session")
        return session

    normalized_title = normalize_session_title(requested_title)
    session = SessionModel(
        id=session_id,
        user_id=user_id or "anonymous",
        title=DEFAULT_SESSION_TITLE,
        user_title=normalized_title if normalized_title and normalized_title != DEFAULT_SESSION_TITLE else None,
        system_title=normalized_title or DEFAULT_SESSION_TITLE,
        title_state=(
            SESSION_TITLE_STATE_USER_LOCKED
            if normalized_title and normalized_title != DEFAULT_SESSION_TITLE
            else SESSION_TITLE_STATE_DRAFT
        ),
    )
    db.add(session)
    db.flush()
    refresh_session_title(db, session)
    return session


def append_messages_to_session(
    db: Session,
    session_record: SessionModel,
    messages: List[Dict[str, Any]],
) -> int:
    if not messages:
        return 0

    existing_ids = {
        row[0]
        for row in db.query(SessionMessage.id)
        .filter(SessionMessage.session_id == session_record.id)
        .all()
    }
    max_seq = db.query(func.max(SessionMessage.sequence_number)).filter(
        SessionMessage.session_id == session_record.id
    ).scalar() or 0

    inserted = 0
    for i, msg in enumerate(messages):
        msg_id = msg.get("id") or str(uuid_mod.uuid4())
        if msg_id in existing_ids:
            continue
        db.add(SessionMessage(
            id=msg_id,
            session_id=session_record.id,
            role=msg["role"],
            type=msg.get("type") or "text",
            content=msg.get("content"),
            artwork_id=msg.get("artwork_id"),
            sequence_number=max_seq + i + 1,
        ))
        inserted += 1

    refresh_session_title(db, session_record)
    return inserted


def get_primary_session_link(db: Session, artwork_id: str) -> Optional[SessionArtwork]:
    return (
        db.query(SessionArtwork)
        .filter(SessionArtwork.artwork_id == artwork_id)
        .order_by(SessionArtwork.created_at.desc(), SessionArtwork.sequence_number.asc())
        .first()
    )


def get_primary_session_id(db: Session, artwork_id: str) -> Optional[str]:
    link = get_primary_session_link(db, artwork_id)
    return link.session_id if link else None


def get_artwork_session_ids(db: Session, artwork_id: str) -> List[str]:
    return [
        session_id
        for (session_id,) in (
            db.query(SessionArtwork.session_id)
            .filter(SessionArtwork.artwork_id == artwork_id)
            .distinct()
            .all()
        )
        if session_id
    ]


def ensure_user_and_session(
    db: Session,
    user_id: Optional[str],
    session_id: Optional[str],
) -> Optional[SessionModel]:
    ensure_user_record(db, user_id)

    if not session_id:
        return None

    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if session:
        sync_session_display_title(session)
        return session

    session = SessionModel(
        id=session_id,
        user_id=user_id or "anonymous",
        title=DEFAULT_SESSION_TITLE,
        system_title=DEFAULT_SESSION_TITLE,
        title_state=SESSION_TITLE_STATE_DRAFT,
    )
    db.add(session)
    db.flush()
    refresh_session_title(db, session)
    return session


def get_session_or_404(db: Session, session_id: str) -> SessionModel:
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_record


def require_session_access(current_user: Optional[User], session_record: SessionModel) -> None:
    if current_user is None:
        return
    if current_user.user_id != session_record.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")


def require_session_owner(current_user: Optional[User], session_record: SessionModel) -> None:
    require_session_access(current_user, session_record)


def resolve_session_ai_provider() -> AIProvider:
    available_providers = AIServiceFactory.get_available_providers()
    if not available_providers:
        raise HTTPException(
            status_code=503,
            detail="No AI services available. Please check configuration.",
        )

    try:
        configured_provider = AIProvider(settings.ai_provider)
        if configured_provider in available_providers:
            return configured_provider
    except ValueError:
        pass

    return available_providers[0]


async def get_session_context(session_id: str) -> Optional[Dict[str, Any]]:
    def sync_get_context():
        with SessionLocal() as db:
            session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if not session_record:
                return None

            linked_artworks = (
                db.query(SavedArtwork)
                .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
                .filter(SessionArtwork.session_id == session_id)
                .order_by(SessionArtwork.sequence_number.asc())
                .all()
            )

            if not linked_artworks and not session_record.narrative_summary:
                return None

            user_goal = (session_record.metadata_json or {}).get("user_goal")
            return {
                "narrative_summary": session_record.narrative_summary,
                "user_goal": user_goal,
                "previous_artworks": [
                    {
                        "artist": art.artist_name,
                        "title": art.artwork_name,
                        "analysis": art.analysis,
                        "tags": [tag.name for tag in art.artwork_tags],
                    }
                    for art in linked_artworks
                ],
            }

    return await anyio.to_thread.run_sync(sync_get_context)


async def update_session_narrative_task(
    session_id: str,
    new_artwork_data: Dict[str, Any],
    identity: str = "default",
    language: Optional[str] = None,
):
    with SessionLocal() as db:
        session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session_record:
            return

        ai_provider = resolve_session_ai_provider()
        ai_service = AIServiceFactory.get_service(ai_provider)

        updated_narrative = await ai_service.summarize_session_narrative(
            previous_narrative=session_record.narrative_summary,
            new_artwork_data=new_artwork_data,
            identity=identity,
            language=language,
        )

        session_record.narrative_summary = updated_narrative
        db.commit()
        logger.info("Updated narrative for session %s", session_id)
