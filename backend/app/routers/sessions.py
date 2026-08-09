from __future__ import annotations

from typing import Any, Dict, List, Optional
import uuid as uuid_mod

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionEvent, User
from app.services.session_service import (
    DEFAULT_SESSION_TITLE,
    SESSION_ARTWORK_LIMIT,
    attach_artwork_ids_to_session,
    append_events_to_session,
    get_or_create_owned_session,
    get_session_or_404,
    normalize_session_title,
    refresh_session_title,
    require_session_access,
    update_session_event,
)
from app.services.session_event_service import derive_session_event_artwork_ids, validate_and_normalize_session_event
from app.utils.auth_utils import get_current_user, require_same_user

router = APIRouter()


class UpdateSessionRequest(BaseModel):
    title: str


class CreateSessionRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None


class AttachSessionArtworksRequest(BaseModel):
    artwork_ids: List[str]


class StartSessionWithEventRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    event: Optional[SessionEventIn] = None
    message: Optional[SessionEventIn] = None


class StartSessionWithArtworksRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    artwork_ids: List[str]


class SessionEventIn(BaseModel):
    id: Optional[str] = None
    role: str
    type: str = "text"
    event_type: Optional[str] = None
    content: Optional[str] = None
    artwork_ids: Optional[List[str]] = None
    trigger_event_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class SessionEventUpdateRequest(BaseModel):
    role: str
    type: Optional[str] = None
    event_type: Optional[str] = None
    content: Optional[str] = None
    artwork_ids: Optional[List[str]] = None
    trigger_event_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


@router.get("/sessions/{session_id}/events")
@router.get("/sessions/{session_id}/messages")
async def get_session_events(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_session_access(current_user, session_record)
    msgs = (
        db.query(SessionEvent)
        .filter(SessionEvent.session_id == session_id)
        .order_by(SessionEvent.sequence_number)
        .all()
    )
    serialized = [message.to_dict() for message in msgs]
    referenced_ids = {
        artwork_id
        for event in serialized
        for artwork_id in derive_session_event_artwork_ids(event.get("event_type"), event.get("payload"))
    }
    deleted_artworks = {
        artwork.id: artwork
        for artwork in db.query(SavedArtwork).filter(
            SavedArtwork.id.in_(referenced_ids),
            SavedArtwork.user_id == session_record.user_id,
            SavedArtwork.deleted_at.is_not(None),
        ).all()
    } if referenced_ids else {}

    for event in serialized:
        deleted_references = []
        for artwork_id in derive_session_event_artwork_ids(event.get("event_type"), event.get("payload")):
            artwork = deleted_artworks.get(artwork_id)
            if not artwork:
                continue
            deleted_references.append({
                "artwork_id": artwork.id,
                "artwork_name": artwork.artwork_name,
                "artist_name": artwork.artist_name,
                "date": (artwork.params or {}).get("date") if isinstance(artwork.params, dict) else None,
                "deleted_at": artwork.deleted_at.isoformat(),
            })
        if deleted_references:
            event["payload"] = {
                **(event.get("payload") or {}),
                "deleted_artworks": deleted_references,
            }

    return serialized


@router.post("/sessions/{session_id}/events")
@router.post("/sessions/{session_id}/messages")
async def append_session_events(
    session_id: str,
    messages: List[SessionEventIn],
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_session_access(current_user, session_record)
    if not messages:
        return {"inserted": 0}

    inserted = append_events_to_session(
        db,
        session_record,
        [msg.model_dump() for msg in messages],
    )
    db.commit()
    return {"inserted": inserted}


@router.patch("/sessions/{session_id}/events/{event_id}")
@router.patch("/sessions/{session_id}/messages/{event_id}")
async def patch_session_event(
    session_id: str,
    event_id: str,
    request: SessionEventUpdateRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_session_access(current_user, session_record)

    updated = update_session_event(
        db,
        session_record,
        event_id,
        request.model_dump(exclude_unset=True),
    )
    db.commit()
    db.refresh(updated)
    return updated.to_dict()


@router.post("/sessions/start-with-event")
@router.post("/sessions/start-with-message")
async def start_session_with_event(
    request: StartSessionWithEventRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_same_user(current_user, user_id)

    submitted_event = request.event or request.message
    if submitted_event is None:
        raise HTTPException(status_code=400, detail="A session event is required")

    normalized_event = validate_and_normalize_session_event(submitted_event.model_dump())
    if normalized_event["event_type"] != "user_input" or not normalized_event.get("content"):
        raise HTTPException(status_code=400, detail="A non-empty user input event is required")

    session_record = get_or_create_owned_session(
        db,
        user_id=user_id,
        session_id=request.session_id,
        requested_title=request.title,
    )
    inserted = append_events_to_session(db, session_record, [normalized_event])
    db.commit()
    db.refresh(session_record)

    return {
        "inserted": inserted,
        "session": session_record.to_dict(),
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_same_user(current_user, user_id)
    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this session")

    db.query(SessionArtwork).filter(SessionArtwork.session_id == session_id).delete()
    db.query(SessionEvent).filter(SessionEvent.session_id == session_id).delete()
    db.delete(session_record)
    db.commit()
    return {"message": "Session deleted successfully"}


@router.get("/sessions")
def list_sessions(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_same_user(current_user, user_id)
    sessions = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == user_id)
        .order_by(SessionModel.updated_at.desc(), SessionModel.created_at.desc())
        .all()
    )
    return [session.to_dict() for session in sessions]


@router.post("/sessions")
async def create_session(
    request: CreateSessionRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_same_user(current_user, user_id)
    session_record = get_or_create_owned_session(
        db,
        user_id=user_id,
        session_id=request.session_id,
        requested_title=request.title,
    )
    db.commit()
    db.refresh(session_record)

    return {
        "message": "Session created successfully",
        "session": session_record.to_dict(),
    }


@router.post("/sessions/start-with-artworks")
async def start_session_with_artworks(
    request: StartSessionWithArtworksRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_same_user(current_user, user_id)

    artwork_ids = [artwork_id for artwork_id in request.artwork_ids if artwork_id]
    if not artwork_ids:
        raise HTTPException(status_code=400, detail="At least one artwork is required")
    if len(artwork_ids) > SESSION_ARTWORK_LIMIT:
        raise HTTPException(status_code=400, detail=f"At most {SESSION_ARTWORK_LIMIT} artworks can be attached at once")

    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.id.in_(artwork_ids),
        SavedArtwork.user_id == user_id,
        SavedArtwork.active_filter(),
    ).all()
    artwork_by_id = {art.id: art for art in artworks}
    missing_ids = [artwork_id for artwork_id in artwork_ids if artwork_id not in artwork_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Artwork not found or not owned: {missing_ids[0]}")

    session_record = get_or_create_owned_session(
        db,
        user_id=user_id,
        session_id=request.session_id,
        requested_title=request.title,
    )

    inserted = attach_artwork_ids_to_session(
        db,
        session_record,
        artwork_ids,
        source="library",
    )

    refresh_session_title(db, session_record)
    db.commit()
    db.refresh(session_record)

    linked_artworks = (
        db.query(SavedArtwork)
        .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
        .filter(SessionArtwork.session_id == session_record.id)
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )

    return {
        "inserted": inserted,
        "session": session_record.to_dict(),
        "artworks": [art.to_dict() for art in linked_artworks],
    }


@router.post("/sessions/{session_id}/artworks")
async def attach_artworks_to_session(
    session_id: str,
    request: AttachSessionArtworksRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_same_user(current_user, user_id)
    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this session")

    artwork_ids = [artwork_id for artwork_id in request.artwork_ids if artwork_id]
    if not artwork_ids:
        return {"inserted": 0, "artworks": []}
    if len(artwork_ids) > SESSION_ARTWORK_LIMIT:
        raise HTTPException(status_code=400, detail=f"At most {SESSION_ARTWORK_LIMIT} artworks can be attached at once")

    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.id.in_(artwork_ids),
        SavedArtwork.user_id == user_id,
        SavedArtwork.active_filter(),
    ).all()
    artwork_by_id = {art.id: art for art in artworks}
    missing_ids = [artwork_id for artwork_id in artwork_ids if artwork_id not in artwork_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Artwork not found or not owned: {missing_ids[0]}")

    inserted = attach_artwork_ids_to_session(
        db,
        session_record,
        artwork_ids,
        source="library",
    )

    refresh_session_title(db, session_record)
    db.commit()

    linked_artworks = (
        db.query(SavedArtwork)
        .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
        .filter(SessionArtwork.session_id == session_id)
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )
    return {
        "inserted": inserted,
        "artworks": [art.to_dict() for art in linked_artworks],
    }


@router.get("/sessions/{session_id}/artworks")
async def get_session_artworks(
    session_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_same_user(current_user, user_id)
    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    linked_artworks = (
        db.query(SavedArtwork)
        .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
        .filter(SessionArtwork.session_id == session_id)
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )

    return {"items": [art.to_dict() for art in linked_artworks]}


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_same_user(current_user, user_id)
    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this session")

    next_title = request.title.strip()
    if not next_title:
        raise HTTPException(status_code=400, detail="Session title cannot be empty")

    session_record.user_title = next_title
    refresh_session_title(db, session_record)
    db.commit()
    db.refresh(session_record)

    return {
        "message": "Session updated successfully",
        "session": session_record.to_dict(),
    }


@router.patch("/sessions/{session_id}/goal")
async def set_session_goal(
    session_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_session_access(current_user, session_record)
    goal = (body.get("goal") or "").strip()
    meta = dict(session_record.metadata_json or {})
    meta["user_goal"] = goal
    session_record.metadata_json = meta
    refresh_session_title(db, session_record)
    db.commit()
    return {"ok": True}
