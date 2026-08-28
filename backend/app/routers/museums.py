from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, selectinload

from app.database.connection import get_db
from app.database.models import SavedArtwork
from app.services.authorization_service import (
    SEARCH_COLLECTION,
    RequestPrincipal,
    get_request_principal,
    require_capability,
    require_principal_for_user,
)


router = APIRouter()


MAX_COVER_ARTWORKS = 3


def _parse_recorded_date(value: str | None, fallback: datetime | None) -> date | None:
    if value:
        normalized = value.strip()
        try:
            parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
            return parsed.astimezone(UTC).date() if parsed.tzinfo is not None else parsed.date()
        except ValueError:
            pass
        for date_format in (
            "%b %d, %Y, %H:%M",
            "%b %d, %Y",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(normalized, date_format).date()
            except ValueError:
                continue
    if fallback is None:
        return None
    return fallback.astimezone(UTC).date() if fallback.tzinfo is not None else fallback.date()


def _created_at_sort_value(artwork: SavedArtwork) -> datetime:
    created_at = artwork.created_at or datetime.min
    if created_at.tzinfo is not None:
        created_at = created_at.astimezone(UTC).replace(tzinfo=None)
    return created_at


def _sorted_artworks(artworks: list[SavedArtwork]) -> list[SavedArtwork]:
    ordered = sorted(artworks, key=lambda artwork: str(artwork.id))
    ordered.sort(key=_created_at_sort_value, reverse=True)
    ordered.sort(
        key=lambda artwork: _parse_recorded_date(artwork.photo_time, artwork.created_at) or date.min,
        reverse=True,
    )
    return ordered


@router.get("/museums")
def get_user_museums(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    principal: RequestPrincipal | None = Depends(get_request_principal),
):
    resolved_principal = require_principal_for_user(principal, user_id)
    require_capability(resolved_principal, SEARCH_COLLECTION)

    artworks = (
        db.query(SavedArtwork)
        .options(selectinload(SavedArtwork.capture_museum_entity))
        .filter(
            SavedArtwork.user_id == user_id,
            SavedArtwork.capture_museum_entity_id.isnot(None),
            SavedArtwork.active_filter(),
        )
        .all()
    )

    grouped: dict[str, dict] = {}
    for artwork in artworks:
        museum = artwork.capture_museum_entity
        if (
            museum is None
            or museum.status != "active"
            or not museum.is_physical_venue
            or not museum.resolution_eligible
        ):
            continue
        recorded_on = _parse_recorded_date(artwork.photo_time, artwork.created_at)
        entry = grouped.get(museum.id)
        if entry is None:
            entry = {
                "museum": {
                    **museum.to_summary_dict(),
                    "thumbnail_url": museum.thumbnail_url,
                    "thumbnail_attribution": museum.thumbnail_attribution,
                },
                "artworks": [],
                "first_recorded_on": recorded_on,
                "last_recorded_on": recorded_on,
            }
            grouped[museum.id] = entry
        entry["artworks"].append(artwork)
        if recorded_on is not None:
            if entry["first_recorded_on"] is None or recorded_on < entry["first_recorded_on"]:
                entry["first_recorded_on"] = recorded_on
            if entry["last_recorded_on"] is None or recorded_on > entry["last_recorded_on"]:
                entry["last_recorded_on"] = recorded_on

    items = []
    for entry in grouped.values():
        ordered_artworks = _sorted_artworks(entry["artworks"])
        items.append({
            "museum": entry["museum"],
            "artwork_count": len(ordered_artworks),
            "artwork_ids": [str(artwork.id) for artwork in ordered_artworks],
            "cover_artwork_ids": [
                str(artwork.id)
                for artwork in ordered_artworks[:MAX_COVER_ARTWORKS]
            ],
            "first_recorded_on": (
                entry["first_recorded_on"].isoformat()
                if entry["first_recorded_on"] is not None
                else None
            ),
            "last_recorded_on": (
                entry["last_recorded_on"].isoformat()
                if entry["last_recorded_on"] is not None
                else None
            ),
        })
    items.sort(
        key=lambda item: (item["last_recorded_on"] or "", item["museum"]["id"]),
        reverse=True,
    )
    return {"items": items, "count": len(items)}
