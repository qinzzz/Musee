from __future__ import annotations

from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session, selectinload, with_loader_criteria

from app.database.models import ArtworkAnalysis, Collection, SavedArtwork
from app.services.retrieval.contracts import SavedArtworkCandidate, SavedArtworkFilters

MAX_RETRIEVAL_TEXT_CHARS = 600
MAX_ELIGIBLE_SCAN = 300


def _clean(value: object) -> str:
    return " ".join(str(value or "").split())


def _display_location(artwork: SavedArtwork) -> str:
    payload = artwork.location if isinstance(artwork.location, dict) else {}
    return _clean(artwork.museum_name or payload.get("museum") or payload.get("city") or payload.get("country"))


def _current_analysis(artwork: SavedArtwork) -> ArtworkAnalysis | None:
    return next(
        (
            analysis for analysis in reversed(artwork.analyses or [])
            if analysis.is_current and analysis.status == "analyzed"
        ),
        None,
    )


def _build_retrieval_text(artwork: SavedArtwork) -> str:
    analysis = _current_analysis(artwork)
    params = artwork.params if isinstance(artwork.params, dict) else {}
    parts = [
        f"{_clean(artwork.artwork_name)} by {_clean(artwork.artist_name)}.",
        _clean(analysis.visual_description if analysis else None),
        _clean(artwork.analysis),
        f"Tags: {', '.join(_clean(tag.name).lstrip('#') for tag in artwork.artwork_tags if tag.name)}.",
        f"Movement: {_clean(artwork.movement)}." if artwork.movement else "",
        f"Medium: {_clean(params.get('medium'))}." if params.get("medium") else "",
        f"Location: {_display_location(artwork)}." if _display_location(artwork) else "",
        f"Collections: {', '.join(_clean(collection.name) for collection in artwork.collections)}."
        if artwork.collections else "",
    ]
    return " ".join(part for part in parts if part)[:MAX_RETRIEVAL_TEXT_CHARS]


def _evenly_sample(rows: list[SavedArtwork], limit: int) -> list[SavedArtwork]:
    if len(rows) <= limit:
        return rows
    if limit == 1:
        return [rows[0]]
    last = len(rows) - 1
    indexes = [(position * last) // (limit - 1) for position in range(limit)]
    return [rows[index] for index in indexes]


def _filtered_saved_artwork_query(
    db: Session,
    *,
    user_id: str,
    filters: SavedArtworkFilters,
    source_ids: list[str] | None = None,
):
    query = db.query(SavedArtwork).filter(
        SavedArtwork.user_id == user_id,
        SavedArtwork.active_filter(),
    )

    if source_ids:
        query = query.filter(SavedArtwork.id.in_(source_ids))

    if filters.artist_name:
        query = query.filter(SavedArtwork.artist_name.ilike(f"%{filters.artist_name.strip()}%"))
    if filters.artwork_title:
        query = query.filter(SavedArtwork.artwork_name.ilike(f"%{filters.artwork_title.strip()}%"))
    if filters.movement:
        query = query.filter(SavedArtwork.movement.ilike(f"%{filters.movement.strip()}%"))
    if filters.classifications:
        query = query.filter(SavedArtwork.classification.in_(filters.classifications))
    if filters.collection_name:
        query = query.join(SavedArtwork.collections).filter(Collection.name.ilike(f"%{filters.collection_name.strip()}%"))
    if filters.location:
        query = query.filter(or_(
            SavedArtwork.museum_name.ilike(f"%{filters.location.strip()}%"),
            cast(SavedArtwork.location, String).ilike(f"%{filters.location.strip()}%"),
        ))
    if filters.saved_after:
        query = query.filter(SavedArtwork.created_at >= filters.saved_after)
    if filters.saved_before:
        query = query.filter(SavedArtwork.created_at <= filters.saved_before)

    return query.distinct()


def count_saved_artworks(
    db: Session,
    *,
    user_id: str,
    filters: SavedArtworkFilters,
) -> int:
    return _filtered_saved_artwork_query(
        db,
        user_id=user_id,
        filters=filters,
    ).count()


def retrieve_saved_artwork_candidates(
    db: Session,
    *,
    user_id: str,
    filters: SavedArtworkFilters,
    candidate_limit: int,
    source_ids: list[str] | None = None,
) -> tuple[list[SavedArtworkCandidate], int, bool]:
    query = _filtered_saved_artwork_query(
        db,
        user_id=user_id,
        filters=filters,
        source_ids=source_ids,
    ).options(
        selectinload(SavedArtwork.artwork_tags),
        selectinload(SavedArtwork.collections),
        selectinload(SavedArtwork.analyses),
        with_loader_criteria(ArtworkAnalysis, ArtworkAnalysis.is_current.is_(True)),
    )
    eligible_count = query.count()
    rows = query.order_by(SavedArtwork.created_at.desc()).limit(MAX_ELIGIBLE_SCAN + 1).all()
    if eligible_count > MAX_ELIGIBLE_SCAN:
        rows = rows[:MAX_ELIGIBLE_SCAN]
    selected_rows = _evenly_sample(rows, candidate_limit)
    candidates = [
        SavedArtworkCandidate(
            source_id=row.id,
            artwork_id=row.artwork_entity_id,
            artist_id=row.artist_entity_id,
            title=row.artwork_name or "Untitled",
            artist=row.artist_name or "Unknown Artist",
            classification=row.classification or "unsorted",
            movement=row.movement,
            museum_name=row.museum_name,
            location=row.location if isinstance(row.location, dict) else None,
            captured_at=row.photo_time,
            saved_at=row.created_at,
            retrieval_text=_build_retrieval_text(row),
            matched_fields=[
                field for field, value in (
                    ("artist_name", filters.artist_name),
                    ("artwork_title", filters.artwork_title),
                    ("movement", filters.movement),
                    ("classification", filters.classifications),
                    ("collection", filters.collection_name),
                    ("location", filters.location),
                    ("saved_after", filters.saved_after),
                    ("saved_before", filters.saved_before),
                ) if value
            ],
        )
        for row in selected_rows
    ]
    return candidates, eligible_count, eligible_count > candidate_limit
