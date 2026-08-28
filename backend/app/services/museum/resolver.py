from __future__ import annotations

import asyncio
import logging

from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.models import SavedArtwork
from app.services.museum.contracts import MuseumResolutionEvidence, MuseumResolutionResult
from app.services.museum.catalogue import intake_discovered_museum
from app.services.museum.evidence import museum_evidence_from_location
from app.services.museum.geometry import footprint_match_buffer
from app.services.museum.intake import complete_museum_intake
from app.services.museum.osm_discovery import discover_museum_candidate
from app.services.museum.repository import find_museum_footprint_matches, find_museums_nearby
from app.services.museum.thumbnail_enrichment import enrich_museum_thumbnail

logger = logging.getLogger(__name__)

MAX_LIVE_ACCURACY_METERS = 100.0
LIVE_RADIUS_PADDING_METERS = 75.0
MAX_LIVE_RADIUS_METERS = 200.0
NON_LIVE_RADIUS_METERS = 75.0
DEFAULT_NON_LIVE_UNCERTAINTY_METERS = 25.0
MIN_CLEAR_DISTANCE_GAP_METERS = 50.0
ACCURACY_GAP_MULTIPLIER = 2.0


def _resolution_radius(evidence: MuseumResolutionEvidence) -> float | None:
    if evidence.source == "device_live":
        accuracy = evidence.accuracy_meters
        if accuracy is None or accuracy <= 0 or accuracy > MAX_LIVE_ACCURACY_METERS:
            return None
        return min(MAX_LIVE_RADIUS_METERS, accuracy + LIVE_RADIUS_PADDING_METERS)
    return NON_LIVE_RADIUS_METERS


def _required_distance_gap(evidence: MuseumResolutionEvidence) -> float:
    uncertainty = evidence.accuracy_meters or DEFAULT_NON_LIVE_UNCERTAINTY_METERS
    return max(MIN_CLEAR_DISTANCE_GAP_METERS, uncertainty * ACCURACY_GAP_MULTIPLIER)


def resolve_museum(db: Session, evidence: MuseumResolutionEvidence) -> MuseumResolutionResult:
    if not (-90 <= evidence.latitude <= 90 and -180 <= evidence.longitude <= 180):
        return MuseumResolutionResult(status="invalid_evidence", reason="coordinates_out_of_range")

    radius = _resolution_radius(evidence)
    if radius is None:
        return MuseumResolutionResult(status="invalid_evidence", reason="unusable_accuracy")

    footprint_matches = find_museum_footprint_matches(
        db,
        latitude=evidence.latitude,
        longitude=evidence.longitude,
        buffer_meters=footprint_match_buffer(evidence.accuracy_meters),
    )
    if len(footprint_matches) == 1:
        museum, footprint_distance = footprint_matches[0]
        return MuseumResolutionResult(
            status="resolved",
            museum_entity_id=str(museum.id),
            distance_meters=footprint_distance,
            reason=(
                "inside_museum_footprint"
                if footprint_distance == 0
                else "near_museum_footprint"
            ),
        )
    if len(footprint_matches) > 1:
        return MuseumResolutionResult(
            status="ambiguous",
            reason="multiple_matching_museum_footprints",
        )

    candidates = find_museums_nearby(
        db,
        latitude=evidence.latitude,
        longitude=evidence.longitude,
        radius_meters=radius,
    )
    if not candidates:
        return MuseumResolutionResult(status="unresolved", reason="no_nearby_museum")
    if len(candidates) > 1:
        nearest, nearest_distance = candidates[0]
        _, runner_up_distance = candidates[1]
        distance_gap = runner_up_distance - nearest_distance
        if distance_gap >= _required_distance_gap(evidence):
            return MuseumResolutionResult(
                status="resolved",
                museum_entity_id=str(nearest.id),
                distance_meters=nearest_distance,
                reason="nearest_clear_by_distance_gap",
            )
        return MuseumResolutionResult(status="ambiguous", reason="multiple_plausible_museums")

    museum, distance = candidates[0]
    return MuseumResolutionResult(
        status="resolved",
        museum_entity_id=str(museum.id),
        distance_meters=distance,
    )


def resolve_artwork_capture_museum(artwork_id: str) -> None:
    """Best-effort background association; artwork persistence never depends on it."""
    try:
        with SessionLocal() as db:
            artwork = db.query(SavedArtwork).filter(
                SavedArtwork.id == artwork_id,
                SavedArtwork.active_filter(),
            ).first()
            if not artwork or artwork.capture_museum_entity_id:
                return

            evidence = museum_evidence_from_location(artwork.location, artwork_id=str(artwork.id))
            if not evidence:
                return

            result = resolve_museum(db, evidence)
            if result.status == "resolved" and result.museum_entity_id:
                artwork.capture_museum_entity_id = result.museum_entity_id
                db.commit()
                logger.info(
                    "Museum resolution artwork=%s museum=%s distance_m=%.1f source=local",
                    artwork_id,
                    result.museum_entity_id,
                    result.distance_meters or 0,
                )
                enrich_museum_thumbnail(result.museum_entity_id)
                return

            should_discover = (
                result.status == "unresolved" and result.reason == "no_nearby_museum"
            ) or result.status == "ambiguous"
            if should_discover:
                discovery = asyncio.run(discover_museum_candidate(evidence))
                footprint_required = result.status == "ambiguous"
                has_required_footprint = bool(
                    discovery.candidate
                    and discovery.candidate.footprint_distance_meters is not None
                    and discovery.reason == "validated_physical_venue_footprint"
                )
                if (
                    discovery.status == "proposed"
                    and discovery.validation
                    and (not footprint_required or has_required_footprint)
                ):
                    intake_result = intake_discovered_museum(db, discovery)
                    museum = intake_result.museum
                    artwork.capture_museum_entity_id = museum.id
                    complete_museum_intake(db, [intake_result])
                    logger.info(
                        "Museum resolution artwork=%s museum=%s source=osm_wikidata",
                        artwork_id,
                        museum.id,
                    )
                    return
                logger.info(
                    "Museum discovery artwork=%s outcome=%s reason=%s",
                    artwork_id,
                    discovery.status,
                    discovery.reason,
                )
                return

            logger.info(
                "Museum resolution artwork=%s outcome=%s reason=%s",
                artwork_id,
                result.status,
                result.reason,
            )
    except Exception as exc:
        logger.warning("Museum resolution failed for artwork=%s: %s", artwork_id, exc)
