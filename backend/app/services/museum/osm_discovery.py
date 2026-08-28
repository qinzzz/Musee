from __future__ import annotations

import asyncio
from dataclasses import dataclass
import re
import time
from typing import Any, Literal, Optional, Protocol

import httpx

from app.config.settings import settings
from app.services.museum.contracts import MuseumResolutionEvidence
from app.services.museum.geometry import (
    footprint_distance_meters,
    footprint_geojson_from_osm_element,
    footprint_match_buffer,
)
from app.services.museum.repository import haversine_distance_meters
from app.services.museum.wikidata_validation import (
    ProviderVenueEvidence,
    VenueValidationResult,
    WikidataEntityProvider,
    validate_wikidata_venue,
)


OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
DISCOVERY_RADIUS_METERS = 250
MAX_POINT_HIGH_CONFIDENCE_METERS = 60.0
MAX_UNIQUE_POINT_FALLBACK_METERS = 120.0
MIN_DISCOVERY_DISTANCE_GAP_METERS = 75.0
ACCURACY_GAP_MULTIPLIER = 2.0
DEFAULT_UNCERTAINTY_METERS = 25.0
OVERPASS_MAX_ATTEMPTS = 3
OVERPASS_CACHE_SECONDS = 300.0
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_QID_PATTERN = re.compile(r"^Q[1-9][0-9]*$")

DiscoveryStatus = Literal["proposed", "unresolved", "ambiguous", "rejected", "error"]


@dataclass(frozen=True)
class OSMMuseumCandidate:
    osm_type: str
    osm_id: str
    name: str
    latitude: float
    longitude: float
    distance_meters: float
    wikidata_qid: Optional[str]
    tourism_kind: str = "museum"
    footprint_geojson: Optional[dict[str, Any]] = None
    contains_capture: bool = False
    footprint_distance_meters: Optional[float] = None


@dataclass(frozen=True)
class MuseumDiscoveryResult:
    status: DiscoveryStatus
    reason: str
    candidate: Optional[OSMMuseumCandidate] = None
    validation: Optional[VenueValidationResult] = None
    candidate_count: int = 0


class OSMCandidateProvider(Protocol):
    async def find_museums(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = DISCOVERY_RADIUS_METERS,
    ) -> list[OSMMuseumCandidate]:
        ...


class OverpassMuseumProvider:
    def __init__(self) -> None:
        self._cache: dict[tuple[float, float, int], tuple[float, list[OSMMuseumCandidate]]] = {}

    async def find_museums(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = DISCOVERY_RADIUS_METERS,
    ) -> list[OSMMuseumCandidate]:
        cache_key = (round(latitude, 4), round(longitude, 4), radius_meters)
        cached = self._cache.get(cache_key)
        if cached and time.monotonic() - cached[0] <= OVERPASS_CACHE_SECONDS:
            return cached[1]

        query = (
            f"[out:json][timeout:10];("
            f'node["tourism"="museum"](around:{radius_meters},{latitude},{longitude});'
            f'way["tourism"="museum"](around:{radius_meters},{latitude},{longitude});'
            f'relation["tourism"="museum"](around:{radius_meters},{latitude},{longitude});'
            f");out center geom;"
        )
        headers = {"User-Agent": settings.wikidata_user_agent}
        async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(20.0, connect=10.0)) as client:
            for attempt in range(OVERPASS_MAX_ATTEMPTS):
                try:
                    response = await client.post(OVERPASS_API_URL, data={"data": query})
                    response.raise_for_status()
                    payload = response.json()
                    candidates = parse_overpass_candidates(payload, latitude, longitude)
                    self._cache[cache_key] = (time.monotonic(), candidates)
                    return candidates
                except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                    status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
                    retryable = status is None or status in RETRYABLE_STATUS_CODES
                    if attempt == OVERPASS_MAX_ATTEMPTS - 1 or not retryable:
                        raise
                    await asyncio.sleep(2**attempt)
        return []


_DEFAULT_OVERPASS_PROVIDER = OverpassMuseumProvider()


def parse_overpass_candidates(
    payload: dict[str, Any],
    capture_latitude: float,
    capture_longitude: float,
) -> list[OSMMuseumCandidate]:
    candidates: list[OSMMuseumCandidate] = []
    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        if tags.get("tourism") != "museum":
            continue
        center = element.get("center")
        bounds = element.get("bounds") or {}
        if not center and all(
            bounds.get(key) is not None
            for key in ("minlat", "maxlat", "minlon", "maxlon")
        ):
            center = {
                "lat": (float(bounds["minlat"]) + float(bounds["maxlat"])) / 2,
                "lon": (float(bounds["minlon"]) + float(bounds["maxlon"])) / 2,
            }
        center = center or element
        latitude = center.get("lat")
        longitude = center.get("lon")
        name = str(tags.get("name:en") or tags.get("name") or "").strip()
        osm_type = str(element.get("type") or "").strip()
        osm_id = str(element.get("id") or "").strip()
        if latitude is None or longitude is None or not name or not osm_type or not osm_id:
            continue
        qid = str(tags.get("wikidata") or "").strip()
        if not _QID_PATTERN.fullmatch(qid):
            qid = None
        distance = haversine_distance_meters(
            capture_latitude, capture_longitude, float(latitude), float(longitude),
        )
        footprint = footprint_geojson_from_osm_element(element)
        footprint_distance = (
            footprint_distance_meters(
                footprint,
                latitude=capture_latitude,
                longitude=capture_longitude,
            )
            if footprint
            else None
        )
        candidates.append(
            OSMMuseumCandidate(
                osm_type=osm_type,
                osm_id=osm_id,
                name=name,
                latitude=float(latitude),
                longitude=float(longitude),
                distance_meters=distance,
                wikidata_qid=qid,
                footprint_geojson=footprint,
                contains_capture=footprint_distance == 0,
                footprint_distance_meters=footprint_distance,
            )
        )
    return sorted(
        candidates,
        key=lambda candidate: (not candidate.contains_capture, candidate.distance_meters),
    )


def select_discovery_candidate(
    candidates: list[OSMMuseumCandidate],
    evidence: MuseumResolutionEvidence,
) -> MuseumDiscoveryResult:
    if not candidates:
        return MuseumDiscoveryResult("unresolved", "no_osm_museum_candidate")

    footprint_buffer = footprint_match_buffer(evidence.accuracy_meters)
    footprint_matches = [
        candidate
        for candidate in candidates
        if candidate.footprint_distance_meters is not None
        and candidate.footprint_distance_meters <= footprint_buffer
    ]
    if len(footprint_matches) > 1:
        return MuseumDiscoveryResult(
            "ambiguous",
            "multiple_matching_osm_footprints",
            footprint_matches[0],
            candidate_count=len(candidates),
        )
    if len(footprint_matches) == 1:
        candidate = footprint_matches[0]
        if not candidate.wikidata_qid:
            return MuseumDiscoveryResult(
                "unresolved",
                "containing_osm_museum_missing_wikidata_qid",
                candidate,
                candidate_count=len(candidates),
            )
        return MuseumDiscoveryResult(
            "proposed",
            (
                "capture_inside_osm_footprint"
                if candidate.contains_capture
                else "capture_near_osm_footprint"
            ),
            candidate,
            candidate_count=len(candidates),
        )

    nearest = candidates[0]
    if (
        len(candidates) == 1
        and nearest.footprint_geojson is None
        and MAX_POINT_HIGH_CONFIDENCE_METERS < nearest.distance_meters
        <= MAX_UNIQUE_POINT_FALLBACK_METERS
    ):
        if not nearest.wikidata_qid:
            return MuseumDiscoveryResult(
                "unresolved",
                "unique_osm_point_missing_wikidata_qid",
                nearest,
                candidate_count=1,
            )
        return MuseumDiscoveryResult(
            "proposed",
            "unique_osm_point_candidate",
            nearest,
            candidate_count=1,
        )
    if nearest.distance_meters > MAX_POINT_HIGH_CONFIDENCE_METERS:
        return MuseumDiscoveryResult(
            "unresolved", "nearest_osm_museum_too_far", nearest, candidate_count=len(candidates),
        )
    if len(candidates) > 1:
        uncertainty = evidence.accuracy_meters or DEFAULT_UNCERTAINTY_METERS
        required_gap = max(MIN_DISCOVERY_DISTANCE_GAP_METERS, uncertainty * ACCURACY_GAP_MULTIPLIER)
        if candidates[1].distance_meters - nearest.distance_meters < required_gap:
            return MuseumDiscoveryResult(
                "ambiguous", "multiple_plausible_osm_museums", nearest,
                candidate_count=len(candidates),
            )
    if not nearest.wikidata_qid:
        return MuseumDiscoveryResult(
            "unresolved", "osm_museum_missing_wikidata_qid", nearest,
            candidate_count=len(candidates),
        )
    return MuseumDiscoveryResult(
        "proposed", "high_confidence_osm_candidate", nearest,
        candidate_count=len(candidates),
    )


async def discover_museum_candidate(
    evidence: MuseumResolutionEvidence,
    *,
    osm_provider: Optional[OSMCandidateProvider] = None,
    wikidata_client: Optional[WikidataEntityProvider] = None,
) -> MuseumDiscoveryResult:
    provider = osm_provider or _DEFAULT_OVERPASS_PROVIDER
    try:
        candidates = await provider.find_museums(evidence.latitude, evidence.longitude)
    except Exception:
        return MuseumDiscoveryResult("error", "overpass_provider_error")

    selection = select_discovery_candidate(candidates, evidence)
    if selection.status != "proposed" or not selection.candidate or not selection.candidate.wikidata_qid:
        return selection

    candidate = selection.candidate
    provider_evidence = ProviderVenueEvidence(
        provider="osm",
        provider_id=f"{candidate.osm_type}/{candidate.osm_id}",
        name=candidate.name,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        tourism_kind=candidate.tourism_kind,
        wikidata_qid=candidate.wikidata_qid,
        capture_latitude=evidence.latitude,
        capture_longitude=evidence.longitude,
    )
    try:
        validation = await validate_wikidata_venue(
            candidate.wikidata_qid,
            provider_evidence=provider_evidence,
            client=wikidata_client,
        )
    except Exception:
        return MuseumDiscoveryResult(
            "error", "wikidata_provider_error", candidate,
            candidate_count=len(candidates),
        )
    if validation.status == "eligible":
        return MuseumDiscoveryResult(
            "proposed",
            (
                "validated_physical_venue_footprint"
                if selection.reason in {
                    "capture_inside_osm_footprint",
                    "capture_near_osm_footprint",
                }
                else (
                    "validated_unique_point_venue"
                    if selection.reason == "unique_osm_point_candidate"
                    else "validated_physical_venue"
                )
            ),
            candidate,
            validation,
            len(candidates),
        )
    return MuseumDiscoveryResult(
        "rejected" if validation.status == "rejected" else "unresolved",
        validation.reason_codes[0] if validation.reason_codes else "wikidata_validation_unknown",
        candidate,
        validation,
        len(candidates),
    )
