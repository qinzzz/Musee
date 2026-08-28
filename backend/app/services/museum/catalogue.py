from __future__ import annotations

from sqlalchemy.orm import Session

from app.database.models import MuseumEntity
from app.services.museum.intake import (
    MuseumIntakeCandidate,
    MuseumIntakeResult,
    find_existing_museum,
    intake_museum,
)
from app.services.museum.osm_discovery import MuseumDiscoveryResult


OSM_FOOTPRINT_SOURCE = "openstreetmap"
OSM_FOOTPRINT_LICENSE = "ODbL-1.0"


def _candidate_from_discovery(discovery: MuseumDiscoveryResult) -> MuseumIntakeCandidate:
    candidate = discovery.candidate
    validation = discovery.validation
    if (
        discovery.status != "proposed"
        or not candidate
        or not candidate.wikidata_qid
        or not validation
        or not validation.resolution_eligible
    ):
        raise ValueError("Only validated, resolution-eligible discoveries can enter the catalogue")

    return MuseumIntakeCandidate(
        source="osm_wikidata",
        canonical_name=validation.canonical_name or candidate.name,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        wikidata_qid=validation.qid,
        osm_type=candidate.osm_type,
        osm_id=candidate.osm_id,
        is_physical_venue=validation.is_physical_venue,
        resolution_eligible=validation.resolution_eligible,
        has_child_venues=validation.has_child_venues,
        parent_wikidata_qid=validation.parent_wikidata_qid,
        validated_at=validation.validated_at,
        footprint_geojson=candidate.footprint_geojson,
        footprint_source=(OSM_FOOTPRINT_SOURCE if candidate.footprint_geojson else None),
        footprint_license=(OSM_FOOTPRINT_LICENSE if candidate.footprint_geojson else None),
        footprint_updated_at=(validation.validated_at if candidate.footprint_geojson else None),
    )


def find_matching_museum_for_discovery(
    db: Session,
    discovery: MuseumDiscoveryResult,
) -> MuseumEntity | None:
    """Find the catalogue row that promotion would reuse, without writing."""
    candidate = discovery.candidate
    validation = discovery.validation
    if not candidate:
        return None
    return find_existing_museum(
        db,
        MuseumIntakeCandidate(
            source="osm_wikidata",
            canonical_name=(
                validation.canonical_name
                if validation and validation.canonical_name
                else candidate.name
            ),
            latitude=candidate.latitude,
            longitude=candidate.longitude,
            wikidata_qid=(validation.qid if validation else candidate.wikidata_qid),
            osm_type=candidate.osm_type,
            osm_id=candidate.osm_id,
        ),
    )


def intake_discovered_museum(
    db: Session,
    discovery: MuseumDiscoveryResult,
) -> MuseumIntakeResult:
    return intake_museum(db, _candidate_from_discovery(discovery))


def match_or_create_discovered_museum(
    db: Session,
    discovery: MuseumDiscoveryResult,
) -> MuseumEntity:
    """Compatibility wrapper for callers that own transaction completion."""
    return intake_discovered_museum(db, discovery).museum
