"""User-owned capture-place decisions; original image location is immutable here."""
import unicodedata

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.models import MuseumEntity, SavedArtwork
from app.models.capture_location import CaptureLocationUpdate
from app.services.artwork_event_service import log_artwork_event
from app.services.authorization_service import RequestPrincipal, SAVE_ARTWORK, require_capability
from app.services.museum.repository import find_museums_nearby

PLACE_MATCH_RADIUS_METERS = 150
LOCATION_UPDATED_EVENT = "artwork_capture_location_updated"


def _name_key(name: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", name).casefold().split())


def update_capture_location(db: Session, artwork_id: str, request: CaptureLocationUpdate,
                            principal: RequestPrincipal | None) -> dict:
    if principal is None:
        raise HTTPException(status_code=401, detail="Sign in to edit a location.")
    require_capability(principal, SAVE_ARTWORK)
    artwork = db.query(SavedArtwork).filter(
        SavedArtwork.id == artwork_id, SavedArtwork.user_id == principal.user_id,
        SavedArtwork.active_filter(),
    ).with_for_update().populate_existing().first()
    if artwork is None:
        raise HTTPException(status_code=404, detail="Artwork not found.")

    museum = None
    if request.source == "museum":
        museum = db.query(MuseumEntity).filter(
            MuseumEntity.id == request.museum_id, MuseumEntity.status == "active",
            MuseumEntity.is_physical_venue.is_(True), MuseumEntity.resolution_eligible.is_(True),
        ).first()
        if museum is None:
            raise HTTPException(status_code=422, detail="This museum is unavailable.")
    elif request.source == "apple_maps" and request.match_hint:
        hint = request.match_hint
        matches = [m for m, _ in find_museums_nearby(
            db, latitude=hint.latitude, longitude=hint.longitude,
            radius_meters=PLACE_MATCH_RADIUS_METERS,
        ) if _name_key(m.canonical_name) == _name_key(hint.name)]
        # Proximity alone must never turn a café selection into a museum.
        if len(matches) == 1:
            museum = matches[0]

    override = request.model_dump(exclude_none=True, exclude={"match_hint"})
    artwork.capture_location_override = override
    artwork.capture_museum_entity_id = museum.id if museum else None
    # Replace the loaded relationship too, so serialization cannot return the old venue.
    artwork.capture_museum_entity = museum
    log_artwork_event(db, artwork_id=artwork.id, event_type=LOCATION_UPDATED_EVENT,
                      actor_role="user", trigger_source="collection",
                      payload={"status": request.status, "source": request.source,
                               "museum_entity_id": museum.id if museum else None})
    db.commit()
    db.refresh(artwork)
    return artwork.to_dict()
