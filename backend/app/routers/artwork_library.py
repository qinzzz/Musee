from __future__ import annotations

from datetime import UTC, datetime
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.config.settings import settings
from app.database.connection import get_db
from app.database.connection import SessionLocal
from app.database.models import ArtistEntity, ArtworkEntity, PublicComment, SavedArtwork, Session as SessionModel, SessionArtwork
from app.services.artwork_analysis_task_service import get_current_analysis
from app.services.authorization_service import (
    SEARCH_COLLECTION,
    RequestPrincipal,
    get_request_principal,
    require_capability,
    require_principal_for_user,
)
from app.services.artwork_entity_service import normalize_entity_name, upsert_artist_entity, upsert_artwork_entity
from app.services.artwork_enrichment_service import do_artist_bio
from app.services.session_service import refresh_session_title

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_collection_search(
    principal: RequestPrincipal | None,
    user_id: str,
) -> RequestPrincipal:
    resolved = require_principal_for_user(principal, user_id)
    require_capability(resolved, SEARCH_COLLECTION)
    return resolved


def _update_artwork_analysis_status(
    artwork_id: str,
    status: str,
    *,
    error: str | None = None,
) -> None:
    with SessionLocal() as recovery_db:
        artwork = recovery_db.query(SavedArtwork).filter(
            SavedArtwork.id == artwork_id,
            SavedArtwork.active_filter(),
        ).first()
        if not artwork:
            return
        artwork.analysis_status = status
        artwork.analysis_error = error
        artwork.analysis_completed_at = datetime.now(UTC)
        recovery_db.commit()


async def _run_artist_bio_with_status_recovery(artwork_id: str, artist_entity_id: str) -> None:
    try:
        await do_artist_bio(artist_entity_id)
    except Exception as exc:
        _update_artwork_analysis_status(artwork_id, "failed", error=str(exc))
        raise
    _update_artwork_analysis_status(artwork_id, "analyzed")


@router.get("/artworks")
def get_artworks(
    user_id: str = Query(...),
    recognized_only: Optional[bool] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    _require_collection_search(principal, user_id)
    try:
        query = (
            db.query(SavedArtwork)
            .options(
                selectinload(SavedArtwork.session_links),
                selectinload(SavedArtwork.artwork_tags),
            )
            .filter(SavedArtwork.user_id == user_id, SavedArtwork.active_filter())
        )
        if recognized_only is not None:
            query = query.filter(SavedArtwork.is_recognized == (1 if recognized_only else 0))
        total = query.order_by(None).count()
        artworks = query.order_by(SavedArtwork.created_at.desc()).offset(offset).limit(limit).all()
        return {
            "items": [a.to_dict() for a in artworks],
            "count": len(artworks),
            "total": total,
            "offset": offset,
            "limit": limit,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve artworks: {exc}")


def movement_hook(name: str, count: int) -> str:
    if count == 1:
        return f"Your first encounter with {name}."
    if count <= 3:
        return f"A small but sharp {name} thread."
    if count <= 6:
        return f"{count} {name} works — a pattern is forming."
    return f"You keep returning to {name}. {count} works deep."


@router.get("/smart-collections")
async def get_smart_collections(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    _require_collection_search(principal, user_id)
    from app.utils.prompt_loader import get_movement_by_name

    period_labels = {"Unknown", "Historical", "Modern", "Contemporary", "Now"}
    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.user_id == user_id,
        SavedArtwork.is_recognized == 1,
        SavedArtwork.active_filter(),
    ).all()

    artist_movement_counts: dict = {}
    for artwork in artworks:
        movement = artwork.movement
        if not movement or movement in period_labels or not artwork.artist_name:
            continue
        artist_movement_counts.setdefault(artwork.artist_name, {})
        artist_movement_counts[artwork.artist_name][movement] = (
            artist_movement_counts[artwork.artist_name].get(movement, 0) + 1
        )

    dominant_movement: dict = {
        artist: max(counts, key=counts.get)
        for artist, counts in artist_movement_counts.items()
    }

    movement_groups: dict = {}
    for artwork in artworks:
        movement = artwork.movement
        if not movement or movement in period_labels:
            continue
        if artwork.artist_name and artwork.artist_name in dominant_movement:
            movement = dominant_movement[artwork.artist_name]
        movement_groups.setdefault(movement, []).append(artwork)

    collections = []
    for movement_name, group in sorted(movement_groups.items(), key=lambda item: -len(item[1])):
        meta = get_movement_by_name(movement_name)
        rarity = meta.get("rarity", "common") if meta else "common"
        description = meta.get("description", "") if meta else ""
        count = len(group)
        collections.append({
            "id": f"movement_{movement_name.lower().replace(' ', '_').replace('/', '_')}",
            "type": "movement",
            "name": movement_name,
            "rarity": rarity,
            "description": description,
            "artwork_count": count,
            "artwork_ids": [artwork.id for artwork in group],
            "cover_uris": [artwork.photo_uri for artwork in group[:4]],
            "hook": movement_hook(movement_name, count),
        })

    return {"collections": collections}


@router.get("/artists")
async def list_user_artists(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    _require_collection_search(principal, user_id)
    rows = (
        db.query(ArtistEntity, func.count(SavedArtwork.id).label("artwork_count"))
        .join(SavedArtwork, SavedArtwork.artist_entity_id == ArtistEntity.id)
        .filter(SavedArtwork.user_id == user_id, SavedArtwork.active_filter())
        .group_by(ArtistEntity.id)
        .order_by(ArtistEntity.display_name)
        .all()
    )
    return [{**entity.to_dict(), "artwork_count": count} for entity, count in rows]


@router.get("/artists/{identifier}")
async def get_artist(identifier: str, db: Session = Depends(get_db)):
    entity = db.query(ArtistEntity).filter(ArtistEntity.id == identifier).first()
    if not entity:
        canonical = identifier.replace("_", " ").lower()
        entity = db.query(ArtistEntity).filter(ArtistEntity.canonical_name == canonical).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Artist not found")
    return entity.to_dict()


@router.get("/artists/{artist_id}/artworks")
async def get_artist_artworks(
    artist_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    _require_collection_search(principal, user_id)
    artworks = (
        db.query(SavedArtwork)
        .filter(
            SavedArtwork.artist_entity_id == artist_id,
            SavedArtwork.user_id == user_id,
            SavedArtwork.active_filter(),
        )
        .order_by(SavedArtwork.created_at.desc())
        .all()
    )
    return [artwork.to_dict() for artwork in artworks]


@router.post("/artworks/{artwork_id}/artist")
async def backfill_artwork_artist(
    artwork_id: str,
    db: Session = Depends(get_db),
):
    artwork = db.query(SavedArtwork).filter(
        SavedArtwork.id == artwork_id,
        SavedArtwork.active_filter(),
    ).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    artwork.analysis_status = "analyzing"
    artwork.analysis_error = None
    artwork.analysis_attempted_at = datetime.now(UTC)
    db.commit()
    db.refresh(artwork)

    artist_name = artwork.artist_name or ""
    if not artist_name or artist_name.lower() in ("unknown", "unknown artist", ""):
        artwork.analysis_status = "analyzed"
        artwork.analysis_completed_at = datetime.now(UTC)
        db.commit()
        return {"artist_entity_id": None}

    if artwork.artist_entity_id:
        entity = db.query(ArtistEntity).filter(ArtistEntity.id == artwork.artist_entity_id).first()
        if entity and entity.bio_status == "done":
            artwork.analysis_status = "analyzed"
            artwork.analysis_completed_at = datetime.now(UTC)
            db.commit()
            return entity.to_dict()
        if entity:
            artist_entity_id = entity.id
            db.close()
            await _run_artist_bio_with_status_recovery(artwork_id, artist_entity_id)
            with SessionLocal() as fresh_db:
                entity = fresh_db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
                return entity.to_dict() if entity else {"artist_entity_id": artist_entity_id}

    entity = db.query(ArtistEntity).filter(
        ArtistEntity.canonical_name == normalize_entity_name(artist_name)
    ).first()
    if not entity:
        entity = upsert_artist_entity(db, artist_name)
    db.flush()
    artwork.artist_entity_id = entity.id
    db.commit()
    artist_entity_id = entity.id
    db.close()

    await _run_artist_bio_with_status_recovery(artwork_id, artist_entity_id)
    with SessionLocal() as fresh_db:
        entity = fresh_db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
        return entity.to_dict() if entity else {"artist_entity_id": artist_entity_id}


@router.get("/artworks/{artwork_id}")
async def get_artwork(artwork_id: str, db: Session = Depends(get_db)):
    artwork = db.query(SavedArtwork).filter(
        SavedArtwork.id == artwork_id,
        SavedArtwork.active_filter(),
    ).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    return artwork.to_dict()


@router.get("/artworks/{artwork_id}/analysis")
async def get_artwork_analysis_debug(artwork_id: str, db: Session = Depends(get_db)):
    """Internal/debug view of the current artwork-analysis row.

    The analysis payload is internal product data and must not reach end
    users, so this endpoint simply does not exist in prod — the frontend
    panel renders nothing when it 404s.
    """
    if settings.env == "prod":
        raise HTTPException(status_code=404, detail="Not found")
    analysis = get_current_analysis(db, artwork_id)
    return {"analysis": analysis.to_dict() if analysis else None}


@router.get("/artworks/{artwork_id}/community")
async def get_community(artwork_id: str, db: Session = Depends(get_db)):
    artwork = db.query(SavedArtwork).filter(
        SavedArtwork.id == artwork_id,
        SavedArtwork.active_filter(),
    ).first()
    if not artwork or not artwork.artwork_entity_id:
        return {"entity": None, "comments": []}

    entity = db.query(ArtworkEntity).filter(ArtworkEntity.id == artwork.artwork_entity_id).first()
    if not entity:
        return {"entity": None, "comments": []}

    comments = (
        db.query(PublicComment)
        .filter(PublicComment.entity_id == entity.id)
        .order_by(PublicComment.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "entity": entity.to_dict(),
        "comments": [comment.to_dict() for comment in comments],
    }


class PublishCommentRequest(BaseModel):
    user_id: str
    text: str


@router.post("/artworks/{artwork_id}/community/comments")
async def publish_comment(
    artwork_id: str,
    body: PublishCommentRequest,
    db: Session = Depends(get_db),
):
    artwork = db.query(SavedArtwork).filter(
        SavedArtwork.id == artwork_id,
        SavedArtwork.active_filter(),
    ).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    if not artwork.artwork_entity_id and artwork.is_recognized and artwork.artist_name and artwork.artwork_name:
        entity = upsert_artwork_entity(db, artwork.artist_name, artwork.artwork_name)
        db.flush()
        artwork.artwork_entity_id = entity.id

    if not artwork.artwork_entity_id:
        raise HTTPException(status_code=400, detail="Artwork has no linked entity (unrecognized)")

    comment = PublicComment(
        entity_id=artwork.artwork_entity_id,
        user_id=body.user_id,
        text=body.text.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment.to_dict()


@router.delete("/artworks/{artwork_id}/community/comments/{comment_id}")
async def delete_comment(
    artwork_id: str,
    comment_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    comment = db.query(PublicComment).filter(
        PublicComment.id == comment_id,
        PublicComment.user_id == user_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found or not yours")
    db.delete(comment)
    db.commit()
    return {"ok": True}


@router.delete("/artworks/{artwork_id}")
async def delete_artwork(
    artwork_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    artwork = db.query(SavedArtwork).filter(
        SavedArtwork.id == artwork_id,
        SavedArtwork.active_filter(),
    ).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")
    if artwork.user_id != user_id and artwork.device_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this artwork")

    artwork.deleted_at = datetime.now(UTC)
    db.commit()

    return {"message": "Artwork removed from collection"}


@router.post("/artworks/batch-delete")
async def batch_delete_artworks(
    artwork_ids: list[str],
    user_id: str,
    db: Session = Depends(get_db),
):
    try:
        active_artwork_ids = {
            artwork_id
            for (artwork_id,) in db.query(SavedArtwork.id).filter(
                SavedArtwork.id.in_(artwork_ids),
                SavedArtwork.user_id == user_id,
                SavedArtwork.active_filter(),
            ).all()
        }
        affected_session_ids = {
            sid
            for (sid,) in db.query(SessionArtwork.session_id)
            .filter(SessionArtwork.artwork_id.in_(active_artwork_ids))
            .distinct()
            .all()
        }

        deleted_count = db.query(SavedArtwork).filter(
            SavedArtwork.id.in_(active_artwork_ids),
            SavedArtwork.user_id == user_id,
            SavedArtwork.active_filter(),
        ).update({SavedArtwork.deleted_at: datetime.now(UTC)}, synchronize_session=False)

        db.commit()

        for session_id in affected_session_ids:
            session_to_refresh = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            refresh_session_title(db, session_to_refresh)

        db.commit()
        return {
            "message": f"Removed {deleted_count} artworks from collection",
            "deleted_count": deleted_count,
        }
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {exc}")
