"""Correction-aware capture place for model context and collection search.

Original metadata stays untouched. An override suppresses all original place
fields; unresolved provider references are not geographic facts.
"""
from sqlalchemy import case, func, select

from app.database.models import MuseumEntity, SavedArtwork


def effective_capture_place(artwork: SavedArtwork) -> dict[str, str]:
    override = artwork.capture_location_override
    museum = artwork.capture_museum_entity
    canonical_name = museum.canonical_name if museum else None
    if override is not None:
        if override.get("status") != "selected":
            return {}
        if override.get("source") == "manual":
            values = {"name": override.get("name")}
        else:
            values = {"museum": canonical_name}
    else:
        original = artwork.location if isinstance(artwork.location, dict) else {}
        values = {key: original.get(key) for key in ("city", "country")}
        values["museum"] = canonical_name or original.get("museum") or artwork.museum_name
        if not any(values.values()):
            values["name"] = original.get("raw")
    return {key: value.strip() for key, value in values.items()
            if isinstance(value, str) and value.strip()}


def capture_place_search_fields():
    """SQL equivalent of effective_capture_place, before counting/pagination."""
    override = SavedArtwork.capture_location_override
    status = override["status"].as_string()
    source = override["source"].as_string()
    original = SavedArtwork.location
    canonical = (select(MuseumEntity.canonical_name)
                 .where(MuseumEntity.id == SavedArtwork.capture_museum_entity_id)
                 .correlate(SavedArtwork).scalar_subquery())
    def clean(value):
        return func.nullif(func.trim(value), "")

    museum = func.coalesce(clean(canonical), clean(original["museum"].as_string()),
                           clean(SavedArtwork.museum_name))
    city = clean(original["city"].as_string())
    country = clean(original["country"].as_string())
    automatic = status.is_(None)
    selected = status == "selected"
    manual = source == "manual"
    return (
        case((automatic, museum), (selected & ~manual, clean(canonical))),
        case((selected & manual, clean(override["name"].as_string())),
             (automatic & museum.is_(None) & city.is_(None) & country.is_(None),
              clean(original["raw"].as_string()))),
        case((automatic, city)),
        case((automatic, country)),
    )
