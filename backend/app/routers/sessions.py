from __future__ import annotations

from typing import Any, Dict, List, Optional
import uuid as uuid_mod

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionMessage, User
from app.services.session_service import (
    DEFAULT_SESSION_TITLE,
    SESSION_ARTWORK_LIMIT,
    append_messages_to_session,
    ensure_session_artwork_link,
    get_or_create_owned_session,
    get_session_or_404,
    normalize_session_title,
    refresh_session_title,
    require_session_access,
)
from app.utils.auth_utils import get_current_user, require_same_user

router = APIRouter()


class UpdateSessionRequest(BaseModel):
    title: str


class CreateSessionRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None


class AttachSessionArtworksRequest(BaseModel):
    artwork_ids: List[str]


class StartSessionWithMessageRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    message: SessionMessageIn


class StartSessionWithArtworksRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None
    artwork_ids: List[str]


class SessionMessageIn(BaseModel):
    id: Optional[str] = None
    role: str
    type: str = "text"
    content: Optional[str] = None
    artwork_id: Optional[str] = None


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_session_access(current_user, session_record)
    msgs = (
        db.query(SessionMessage)
        .filter(SessionMessage.session_id == session_id)
        .order_by(SessionMessage.sequence_number)
        .all()
    )
    return [m.to_dict() for m in msgs]


@router.post("/sessions/{session_id}/messages")
async def append_session_messages(
    session_id: str,
    messages: List[SessionMessageIn],
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    session_record = get_session_or_404(db, session_id)
    require_session_access(current_user, session_record)
    if not messages:
        return {"inserted": 0}

    inserted = append_messages_to_session(
        db,
        session_record,
        [msg.model_dump() for msg in messages],
    )
    db.commit()
    return {"inserted": inserted}


@router.post("/sessions/start-with-message")
async def start_session_with_message(
    request: StartSessionWithMessageRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    require_same_user(current_user, user_id)

    message = request.message
    if message.role != "user" or (message.type or "text") != "text" or not (message.content or "").strip():
        raise HTTPException(status_code=400, detail="A non-empty user text message is required")

    session_record = get_or_create_owned_session(
        db,
        user_id=user_id,
        session_id=request.session_id,
        requested_title=request.title,
    )
    inserted = append_messages_to_session(db, session_record, [message.model_dump()])
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
    db.query(SessionMessage).filter(SessionMessage.session_id == session_id).delete()
    db.delete(session_record)
    db.commit()
    return {"message": "Session deleted successfully"}


@router.get("/sessions")
async def list_sessions(
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

    current_max_seq = db.query(func.max(SessionArtwork.sequence_number)).filter(
        SessionArtwork.session_id == session_record.id
    ).scalar() or 0

    inserted = 0
    for offset, artwork_id in enumerate(artwork_ids, start=1):
        existing = db.query(SessionArtwork).filter(
            SessionArtwork.session_id == session_record.id,
            SessionArtwork.artwork_id == artwork_id,
        ).first()
        if existing:
            continue
        ensure_session_artwork_link(
            db,
            session_id=session_record.id,
            artwork_id=artwork_id,
            source="library",
            sequence_number=current_max_seq + offset,
        )
        inserted += 1

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
    ).all()
    artwork_by_id = {art.id: art for art in artworks}
    missing_ids = [artwork_id for artwork_id in artwork_ids if artwork_id not in artwork_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Artwork not found or not owned: {missing_ids[0]}")

    current_max_seq = db.query(func.max(SessionArtwork.sequence_number)).filter(
        SessionArtwork.session_id == session_id
    ).scalar() or 0

    inserted = 0
    for offset, artwork_id in enumerate(artwork_ids, start=1):
        existing = db.query(SessionArtwork).filter(
            SessionArtwork.session_id == session_id,
            SessionArtwork.artwork_id == artwork_id,
        ).first()
        if existing:
            continue
        ensure_session_artwork_link(
            db,
            session_id=session_id,
            artwork_id=artwork_id,
            source="library",
            sequence_number=current_max_seq + offset,
        )
        inserted += 1

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
