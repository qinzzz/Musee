from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.models import SavedArtwork, Session as SessionModel, SessionEvent
from app.models.ai_job import AIJobType
from app.prompts.registry import SessionChatTurnContext, render_prompt_turn
from app.services.artwork_analysis_service import image_url_to_bytes
from app.services.session_event_service import derive_session_event_artwork_ids, normalize_session_event_type


class SessionChatItem(BaseModel):
    id: str
    url: str
    keywords: List[str] = Field(default_factory=list)
    artist_name: Optional[str] = None
    artwork_name: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    medium: Optional[str] = None


class SessionChatRequest(BaseModel):
    session_id: str
    trigger_event_id: str


@dataclass(frozen=True)
class ResolvedSessionChatRequest:
    items: List[SessionChatItem]
    conversation_history: List[Dict[str, Any]]
    new_message: str
    has_user_text: bool
    trigger_event: SessionEvent


def _artwork_label(artwork: SavedArtwork) -> str:
    title = artwork.artwork_name or "Untitled"
    artist = artwork.artist_name or "Unknown Artist"
    return f'"{title}" by {artist}'


def _artwork_to_chat_item(artwork: SavedArtwork) -> SessionChatItem:
    params = artwork.params if isinstance(artwork.params, dict) else {}
    return SessionChatItem(
        id=artwork.id,
        url=artwork.photo_uri,
        keywords=[tag.name for tag in artwork.artwork_tags],
        artist_name=artwork.artist_name,
        artwork_name=artwork.artwork_name,
        description=artwork.analysis,
        date=params.get("date"),
        medium=params.get("medium"),
    )


def _event_artwork_labels(event: SessionEvent, artworks_by_id: Dict[str, SavedArtwork]) -> List[str]:
    return [
        _artwork_label(artworks_by_id[artwork_id])
        for artwork_id in derive_session_event_artwork_ids(event.type, event.payload)
        if artwork_id in artworks_by_id
    ]


def _build_history(
    events: List[SessionEvent],
    artworks_by_id: Dict[str, SavedArtwork],
) -> List[Dict[str, Any]]:
    history: List[Dict[str, Any]] = []
    for event in events:
        event_type = normalize_session_event_type(event.type, role=event.role)
        content = (event.content or "").strip()
        if event.role == "user":
            if content:
                history.append({"role": "user", "content": content})
                continue
            labels = _event_artwork_labels(event, artworks_by_id)
            if labels:
                summary = labels[0] if len(labels) == 1 else f"{len(labels)} artworks: " + "; ".join(labels)
                history.append({"role": "user", "content": f"The user added {summary}."})
        elif event.role == "model" and content and event_type in {"message", "model_response"}:
            if event_type == "model_response" and (event.payload or {}).get("status") not in {None, "completed"}:
                continue
            history_entry: Dict[str, Any] = {"role": "assistant", "content": content}
            retrieval = (event.payload or {}).get("retrieval")
            source_ids = retrieval.get("selected_source_ids") if isinstance(retrieval, dict) else None
            if isinstance(source_ids, list):
                normalized_source_ids = [source_id for source_id in source_ids if isinstance(source_id, str)]
                if normalized_source_ids:
                    history_entry["retrieval_source_ids"] = normalized_source_ids
            history.append(history_entry)
    return history


def resolve_session_chat_request(
    db: Session,
    session_record: SessionModel,
    trigger_event_id: str,
) -> ResolvedSessionChatRequest:
    """Resolve canonical model input from the persisted Session timeline."""
    trigger_event = (
        db.query(SessionEvent)
        .filter(
            SessionEvent.session_id == session_record.id,
            SessionEvent.id == trigger_event_id,
        )
        .first()
    )
    if trigger_event is None:
        raise HTTPException(status_code=404, detail="Trigger event not found")
    if trigger_event.role != "user" or normalize_session_event_type(
        trigger_event.type,
        role=trigger_event.role,
    ) != "user_input":
        raise HTTPException(status_code=400, detail="Trigger event must be a user_input event")

    links = list(session_record.artwork_links)
    artworks = [link.artwork for link in links if link.artwork and link.artwork.deleted_at is None]
    artworks_by_id = {artwork.id: artwork for artwork in artworks}
    current_artwork_ids = derive_session_event_artwork_ids(trigger_event.type, trigger_event.payload)
    current_id_set = set(current_artwork_ids)
    ordered_artworks = [artworks_by_id[artwork_id] for artwork_id in current_artwork_ids if artwork_id in artworks_by_id]
    ordered_artworks.extend(artwork for artwork in artworks if artwork.id not in current_id_set)

    prior_events = (
        db.query(SessionEvent)
        .filter(
            SessionEvent.session_id == session_record.id,
            SessionEvent.sequence_number < trigger_event.sequence_number,
        )
        .order_by(SessionEvent.sequence_number.asc())
        .all()
    )
    user_text = (trigger_event.content or "").strip() or None
    artwork_labels = [
        _artwork_label(artworks_by_id[artwork_id])
        for artwork_id in current_artwork_ids
        if artwork_id in artworks_by_id
    ]
    if not user_text and not artwork_labels:
        raise HTTPException(status_code=422, detail="Trigger event has no available text or artworks")

    artwork_entries = (trigger_event.payload or {}).get("artworks", [])
    sources = [
        str(entry["source"])
        for entry in artwork_entries
        if isinstance(entry, dict) and entry.get("source")
    ]
    has_prior_user_turn = any(event.role == "user" for event in prior_events)
    new_message = render_prompt_turn(
        AIJobType.SESSION_CHAT,
        SessionChatTurnContext(
            user_text=user_text,
            artwork_labels=artwork_labels,
            artwork_sources=sources,
            is_first_turn=not has_prior_user_turn,
            user_goal=(session_record.metadata_json or {}).get("user_goal"),
        ),
    )
    return ResolvedSessionChatRequest(
        items=[_artwork_to_chat_item(artwork) for artwork in ordered_artworks],
        conversation_history=_build_history(prior_events, artworks_by_id),
        new_message=new_message,
        has_user_text=user_text is not None,
        trigger_event=trigger_event,
    )


def build_session_chat_items_payload(items: List[SessionChatItem]) -> List[Dict[str, Any]]:
    return [
        {
            "id": item.id,
            "keywords": item.keywords,
            "artist_name": item.artist_name,
            "artwork_name": item.artwork_name,
            "description": item.description,
            "date": item.date,
            "medium": item.medium,
        }
        for item in items
    ]


async def load_bootstrap_image_bytes(
    items: List[SessionChatItem],
    conversation_history: List[Dict[str, str]],
) -> List[bytes]:
    if conversation_history or not items:
        return []

    image_bytes_list: List[bytes] = []
    for item in items[:10]:
        image_bytes = await image_url_to_bytes(item.url)
        if image_bytes:
            image_bytes_list.append(image_bytes)
    return image_bytes_list
