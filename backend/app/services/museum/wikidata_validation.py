from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any, Literal, Mapping, Optional, Protocol

import httpx

from app.config.settings import settings
from app.services.museum.repository import haversine_distance_meters


WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"
MUSEUM_ROOT_QID = "Q33506"
ART_MUSEUM_QID = "Q207694"
KNOWN_MUSEUM_CLASSES = {MUSEUM_ROOT_QID, ART_MUSEUM_QID}
MAX_SUBCLASS_DEPTH = 5
MAX_WIKIDATA_ATTEMPTS = 3
SHARED_CHILD_COORDINATE_METERS = 30.0
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

ValidationStatus = Literal["eligible", "rejected", "unknown"]


@dataclass(frozen=True)
class ProviderVenueEvidence:
    provider: str
    provider_id: str
    name: str
    latitude: float
    longitude: float
    tourism_kind: str
    wikidata_qid: str
    capture_latitude: Optional[float] = None
    capture_longitude: Optional[float] = None


@dataclass(frozen=True)
class VenueValidationResult:
    status: ValidationStatus
    qid: str
    canonical_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    is_physical_venue: bool
    resolution_eligible: bool
    has_child_venues: bool
    parent_wikidata_qid: Optional[str]
    reason_codes: tuple[str, ...]
    validated_at: datetime


class WikidataEntityProvider(Protocol):
    async def get_entities(self, qids: list[str]) -> dict[str, dict[str, Any]]:
        ...


class WikidataEntityClient:
    def __init__(self) -> None:
        self._cache: dict[str, dict[str, Any]] = {}

    async def get_entities(self, qids: list[str]) -> dict[str, dict[str, Any]]:
        unique_qids = list(dict.fromkeys(qid for qid in qids if qid))
        missing = [qid for qid in unique_qids if qid not in self._cache]
        for offset in range(0, len(missing), 50):
            batch = missing[offset:offset + 50]
            payload = await self._fetch_batch(batch)
            self._cache.update(payload)
        return {qid: self._cache[qid] for qid in unique_qids if qid in self._cache}

    async def _fetch_batch(self, qids: list[str]) -> dict[str, dict[str, Any]]:
        if not qids:
            return {}
        headers = {"User-Agent": settings.wikidata_user_agent}
        async with httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            for attempt in range(MAX_WIKIDATA_ATTEMPTS):
                try:
                    response = await client.get(
                        WIKIDATA_API_URL,
                        params={
                            "action": "wbgetentities",
                            "ids": "|".join(qids),
                            "format": "json",
                            "languages": "en",
                            "props": "labels|claims",
                        },
                    )
                    response.raise_for_status()
                    entities = response.json().get("entities", {})
                    return entities if isinstance(entities, dict) else {}
                except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                    status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
                    retryable = status is None or status in RETRYABLE_STATUS_CODES
                    if attempt == MAX_WIKIDATA_ATTEMPTS - 1 or not retryable:
                        raise
                    await asyncio.sleep(2**attempt)
        return {}


_DEFAULT_WIKIDATA_CLIENT = WikidataEntityClient()


_CLASS_RESULT_CACHE: dict[str, bool] = {}


def clear_wikidata_validation_cache() -> None:
    _CLASS_RESULT_CACHE.clear()


def _item_qids(entity: Mapping[str, Any], property_id: str) -> list[str]:
    claims = entity.get("claims", {})
    values: list[str] = []
    for claim in claims.get(property_id, []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, Mapping) and value.get("id"):
            values.append(str(value["id"]))
    return values


def _coordinate(entity: Mapping[str, Any]) -> Optional[tuple[float, float]]:
    claims = entity.get("claims", {})
    for claim in claims.get("P625", []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, Mapping) and value.get("latitude") is not None and value.get("longitude") is not None:
            return float(value["latitude"]), float(value["longitude"])
    return None


def _english_label(entity: Mapping[str, Any]) -> Optional[str]:
    label = entity.get("labels", {}).get("en", {}).get("value")
    return str(label).strip() if label else None


async def _is_museum_class(
    qid: str,
    client: WikidataEntityProvider,
    *,
    depth: int = 0,
    visited: Optional[set[str]] = None,
) -> bool:
    if qid in KNOWN_MUSEUM_CLASSES:
        return True
    if qid in _CLASS_RESULT_CACHE:
        return _CLASS_RESULT_CACHE[qid]
    if depth >= MAX_SUBCLASS_DEPTH:
        return False

    path = set(visited or ())
    if qid in path:
        return False
    path.add(qid)
    entity = (await client.get_entities([qid])).get(qid)
    if not entity:
        _CLASS_RESULT_CACHE[qid] = False
        return False

    for parent_qid in _item_qids(entity, "P279"):
        if await _is_museum_class(parent_qid, client, depth=depth + 1, visited=path):
            _CLASS_RESULT_CACHE[qid] = True
            return True
    _CLASS_RESULT_CACHE[qid] = False
    return False


async def _entity_is_museum(entity: Mapping[str, Any], client: WikidataEntityProvider) -> bool:
    for instance_qid in _item_qids(entity, "P31"):
        if await _is_museum_class(instance_qid, client):
            return True
    return False


async def validate_wikidata_venue(
    qid: str,
    *,
    provider_evidence: Optional[ProviderVenueEvidence] = None,
    client: Optional[WikidataEntityProvider] = None,
    _visited: Optional[set[str]] = None,
) -> VenueValidationResult:
    entity_client = client or _DEFAULT_WIKIDATA_CLIENT
    visited = set(_visited or ())
    if qid in visited:
        now = datetime.now(UTC)
        return VenueValidationResult(
            "unknown", qid, None, None, None, False, False, False, None,
            ("cyclic_venue_hierarchy",), now,
        )
    visited.add(qid)
    entity = (await entity_client.get_entities([qid])).get(qid)
    now = datetime.now(UTC)
    if not entity or entity.get("missing") is not None:
        return VenueValidationResult(
            "unknown", qid, None, None, None, False, False, False, None,
            ("wikidata_entity_missing",), now,
        )

    name = _english_label(entity)
    coordinates = _coordinate(entity)
    if not await _entity_is_museum(entity, entity_client):
        return VenueValidationResult(
            "rejected", qid, name,
            coordinates[0] if coordinates else None,
            coordinates[1] if coordinates else None,
            False, False, False, None,
            ("incompatible_institution_type",), now,
        )
    if not coordinates:
        return VenueValidationResult(
            "unknown", qid, name, None, None, False, False, False, None,
            ("missing_wikidata_coordinates",), now,
        )

    child_qids = _item_qids(entity, "P527")
    parent_qids = _item_qids(entity, "P361") or _item_qids(entity, "P749")
    child_entities = await entity_client.get_entities(child_qids)
    physical_children: list[tuple[str, Mapping[str, Any], tuple[float, float]]] = []
    for child_qid in child_qids:
        child = child_entities.get(child_qid)
        child_coordinates = _coordinate(child) if child else None
        if child and child_coordinates and await _entity_is_museum(child, entity_client):
            physical_children.append((child_qid, child, child_coordinates))

    has_child_venues = bool(physical_children)
    has_provider_venue_evidence = bool(
        provider_evidence
        and provider_evidence.wikidata_qid == qid
        and provider_evidence.tourism_kind == "museum"
    )
    shared_children = [
        child
        for child in physical_children
        if haversine_distance_meters(
            coordinates[0], coordinates[1], child[2][0], child[2][1],
        ) <= SHARED_CHILD_COORDINATE_METERS
    ]
    shares_child_coordinates = bool(shared_children)

    if shares_child_coordinates and has_provider_venue_evidence:
        reference_latitude = (
            provider_evidence.capture_latitude
            if provider_evidence.capture_latitude is not None
            else provider_evidence.latitude
        )
        reference_longitude = (
            provider_evidence.capture_longitude
            if provider_evidence.capture_longitude is not None
            else provider_evidence.longitude
        )
        ranked_children = sorted(
            shared_children,
            key=lambda child: haversine_distance_meters(
                reference_latitude, reference_longitude, child[2][0], child[2][1],
            ),
        )
        if len(ranked_children) > 1:
            nearest_distance = haversine_distance_meters(
                reference_latitude, reference_longitude,
                ranked_children[0][2][0], ranked_children[0][2][1],
            )
            next_distance = haversine_distance_meters(
                reference_latitude, reference_longitude,
                ranked_children[1][2][0], ranked_children[1][2][1],
            )
            if next_distance - nearest_distance <= SHARED_CHILD_COORDINATE_METERS:
                return VenueValidationResult(
                    "unknown", qid, name, coordinates[0], coordinates[1], False, False,
                    True, parent_qids[0] if parent_qids else None,
                    ("multiple_shared_physical_child_venues",), now,
                )

        child_qid = ranked_children[0][0]
        child_result = await validate_wikidata_venue(
            child_qid,
            provider_evidence=replace(provider_evidence, wikidata_qid=child_qid),
            client=entity_client,
            _visited=visited,
        )
        if child_result.status == "eligible":
            return replace(
                child_result,
                parent_wikidata_qid=qid,
                reason_codes=("resolved_to_nearest_shared_child_venue",) + child_result.reason_codes,
            )
        return child_result

    if has_child_venues and shares_child_coordinates and not has_provider_venue_evidence:
        return VenueValidationResult(
            "rejected", qid, name, coordinates[0], coordinates[1], False, False,
            True, parent_qids[0] if parent_qids else None,
            ("pure_organization_shared_coordinates_with_child",), now,
        )
    if has_child_venues and not has_provider_venue_evidence:
        return VenueValidationResult(
            "unknown", qid, name, coordinates[0], coordinates[1], False, False,
            True, parent_qids[0] if parent_qids else None,
            ("parent_without_independent_venue_evidence",), now,
        )

    reasons = ["museum_class_valid", "independent_physical_location"]
    if has_child_venues:
        reasons.append("physical_flagship_with_child_venues")
    return VenueValidationResult(
        "eligible", qid, name, coordinates[0], coordinates[1], True, True,
        has_child_venues, parent_qids[0] if parent_qids else None,
        tuple(reasons), now,
    )
