from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Iterable, Literal, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.models import MuseumEntity
from app.services.museum.geometry import footprint_bounds
from app.services.museum.thumbnail_enrichment import enrich_museum_thumbnails


MuseumIntakeAction = Literal["created", "updated", "reused"]
MuseumIntakeSource = Literal["osm_wikidata", "wikidata_region"]
EnrichmentDispatcher = Callable[[Iterable[str]], None]

_SOURCE_UPDATE_FIELDS: dict[MuseumIntakeSource, frozenset[str]] = {
    "wikidata_region": frozenset({
        "canonical_name",
        "latitude",
        "longitude",
        "country_code",
        "status",
    }),
    "osm_wikidata": frozenset({
        "canonical_name",
        "latitude",
        "longitude",
        "osm_type",
        "osm_id",
        "is_physical_venue",
        "resolution_eligible",
        "has_child_venues",
        "parent_wikidata_qid",
        "validation_source",
        "validated_at",
        "footprint_geojson",
        "footprint_min_latitude",
        "footprint_max_latitude",
        "footprint_min_longitude",
        "footprint_max_longitude",
        "footprint_source",
        "footprint_license",
        "footprint_updated_at",
        "status",
    }),
}


@dataclass(frozen=True)
class MuseumIntakeCandidate:
    source: MuseumIntakeSource
    canonical_name: str
    latitude: float
    longitude: float
    wikidata_qid: Optional[str] = None
    country_code: Optional[str] = None
    osm_type: Optional[str] = None
    osm_id: Optional[str] = None
    is_physical_venue: bool = True
    resolution_eligible: bool = True
    has_child_venues: bool = False
    parent_wikidata_qid: Optional[str] = None
    validated_at: Optional[datetime] = None
    footprint_geojson: Optional[dict[str, Any]] = None
    footprint_source: Optional[str] = None
    footprint_license: Optional[str] = None
    footprint_updated_at: Optional[datetime] = None
    status: str = "active"


@dataclass(frozen=True)
class MuseumIntakeResult:
    museum: MuseumEntity
    action: MuseumIntakeAction
    thumbnail_enrichment_needed: bool


class MuseumIntakeConflict(ValueError):
    """Raised when provider identities point to different catalogue rows."""


def _candidate_values(candidate: MuseumIntakeCandidate) -> dict[str, Any]:
    values: dict[str, Any] = {
        "canonical_name": candidate.canonical_name.strip(),
        "latitude": candidate.latitude,
        "longitude": candidate.longitude,
        "country_code": candidate.country_code,
        "wikidata_qid": candidate.wikidata_qid,
        "osm_type": candidate.osm_type,
        "osm_id": candidate.osm_id,
        "is_physical_venue": candidate.is_physical_venue,
        "resolution_eligible": candidate.resolution_eligible,
        "has_child_venues": candidate.has_child_venues,
        "parent_wikidata_qid": candidate.parent_wikidata_qid,
        "validation_source": candidate.source,
        "validated_at": candidate.validated_at,
        "footprint_geojson": candidate.footprint_geojson,
        "footprint_source": candidate.footprint_source,
        "footprint_license": candidate.footprint_license,
        "footprint_updated_at": candidate.footprint_updated_at,
        "status": candidate.status,
    }
    bounds = footprint_bounds(candidate.footprint_geojson) if candidate.footprint_geojson else None
    if bounds:
        (
            values["footprint_min_latitude"],
            values["footprint_max_latitude"],
            values["footprint_min_longitude"],
            values["footprint_max_longitude"],
        ) = bounds
    else:
        values.update({
            "footprint_min_latitude": None,
            "footprint_max_latitude": None,
            "footprint_min_longitude": None,
            "footprint_max_longitude": None,
        })
    return values


def _validate_candidate(candidate: MuseumIntakeCandidate) -> None:
    if not candidate.canonical_name.strip():
        raise ValueError("Museum intake requires a canonical name")
    if not -90 <= candidate.latitude <= 90 or not -180 <= candidate.longitude <= 180:
        raise ValueError("Museum intake coordinates are invalid")
    if not candidate.wikidata_qid and not (candidate.osm_type and candidate.osm_id):
        raise ValueError("Museum intake requires a Wikidata or OSM identity")
    if bool(candidate.osm_type) != bool(candidate.osm_id):
        raise ValueError("OSM type and ID must be supplied together")


def find_existing_museum(
    db: Session,
    candidate: MuseumIntakeCandidate,
) -> MuseumEntity | None:
    by_qid = None
    if candidate.wikidata_qid:
        by_qid = (
            db.query(MuseumEntity)
            .filter(MuseumEntity.wikidata_qid == candidate.wikidata_qid)
            .first()
        )
    by_osm = None
    if candidate.osm_type and candidate.osm_id:
        by_osm = (
            db.query(MuseumEntity)
            .filter(
                MuseumEntity.osm_type == candidate.osm_type,
                MuseumEntity.osm_id == candidate.osm_id,
            )
            .first()
        )
    if by_qid is not None and by_osm is not None and by_qid.id != by_osm.id:
        raise MuseumIntakeConflict("Wikidata and OSM identities resolve to different museums")
    return by_qid or by_osm


def _create_museum(
    db: Session,
    candidate: MuseumIntakeCandidate,
    values: dict[str, Any],
) -> tuple[MuseumEntity, bool]:
    if db.get_bind().dialect.name == "sqlite":
        museum = MuseumEntity(**values)
        db.add(museum)
        db.flush()
        return museum, True
    try:
        with db.begin_nested():
            museum = MuseumEntity(**values)
            db.add(museum)
            db.flush()
        return museum, True
    except IntegrityError:
        museum = find_existing_museum(db, candidate)
        if museum is None:
            raise
        return museum, False


def intake_museum(db: Session, candidate: MuseumIntakeCandidate) -> MuseumIntakeResult:
    """Idempotently normalize, deduplicate, and persist one physical venue candidate."""
    _validate_candidate(candidate)
    values = _candidate_values(candidate)
    museum = find_existing_museum(db, candidate)
    created = False
    if museum is None:
        museum, created = _create_museum(db, candidate, values)

    if created:
        action: MuseumIntakeAction = "created"
    else:
        changed = False
        for field_name in _SOURCE_UPDATE_FIELDS[candidate.source]:
            value = values[field_name]
            if getattr(museum, field_name) != value:
                setattr(museum, field_name, value)
                changed = True
        db.flush()
        action = "updated" if changed else "reused"

    return MuseumIntakeResult(
        museum=museum,
        action=action,
        thumbnail_enrichment_needed=bool(
            museum.wikidata_qid and not museum.thumbnail_url
        ),
    )


def complete_museum_intake(
    db: Session,
    results: Iterable[MuseumIntakeResult],
    *,
    enrichment_dispatcher: EnrichmentDispatcher = enrich_museum_thumbnails,
) -> None:
    """Commit core catalogue writes before starting optional, retryable enrichment."""
    materialized = list(results)
    db.commit()
    enrichment_dispatcher(
        result.museum.id
        for result in materialized
        if result.thumbnail_enrichment_needed
    )
