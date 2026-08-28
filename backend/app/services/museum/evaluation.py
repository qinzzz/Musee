from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any, Awaitable, Callable, Literal, Mapping, Optional

from sqlalchemy.orm import Session

from app.database.models import MuseumEntity, SavedArtwork
from app.services.museum.catalogue import find_matching_museum_for_discovery
from app.services.museum.contracts import MuseumResolutionEvidence, MuseumResolutionResult
from app.services.museum.evidence import museum_evidence_from_location
from app.services.museum.osm_discovery import MuseumDiscoveryResult, discover_museum_candidate
from app.services.museum.resolver import resolve_museum


EvaluationBucket = Literal[
    "local_match",
    "proposed",
    "ambiguous",
    "unresolved",
    "rejected",
    "provider_error",
    "invalid_evidence",
]
CatalogueAction = Literal["create", "reuse"]
LocalResolver = Callable[[Session, MuseumResolutionEvidence], MuseumResolutionResult]
Discoverer = Callable[[MuseumResolutionEvidence], Awaitable[MuseumDiscoveryResult]]


@dataclass(frozen=True)
class ArtworkEvaluation:
    artwork_id: str
    artwork_name: str
    bucket: EvaluationBucket
    reason: str
    evidence_source: str
    latitude: float
    longitude: float
    accuracy_meters: Optional[float]
    current_museum_entity_id: Optional[str] = None
    resolved_museum_entity_id: Optional[str] = None
    resolved_museum_name: Optional[str] = None
    distance_meters: Optional[float] = None
    candidate_name: Optional[str] = None
    candidate_wikidata_qid: Optional[str] = None
    candidate_distance_meters: Optional[float] = None
    catalogue_action: Optional[CatalogueAction] = None
    catalogue_match_id: Optional[str] = None
    crashed: bool = False


@dataclass(frozen=True)
class EvaluationReport:
    total: int
    counts: dict[str, int]
    proposed_catalogue_actions: dict[str, int]
    rows: list[ArtworkEvaluation]

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "counts": self.counts,
            "proposed_catalogue_actions": self.proposed_catalogue_actions,
            "rows": [asdict(row) for row in self.rows],
        }


def apply_local_matches(db: Session, report: EvaluationReport) -> int:
    """Persist only explicit local matches without overwriting any association."""
    applied = 0
    for row in report.rows:
        if (
            row.bucket != "local_match"
            or not row.resolved_museum_entity_id
            or row.crashed
        ):
            continue
        updated = (
            db.query(SavedArtwork)
            .filter(
                SavedArtwork.id == row.artwork_id,
                SavedArtwork.capture_museum_entity_id.is_(None),
                SavedArtwork.active_filter(),
            )
            .update(
                {SavedArtwork.capture_museum_entity_id: row.resolved_museum_entity_id},
                synchronize_session=False,
            )
        )
        applied += updated
    return applied


def _float_or_none(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def evidence_for_evaluation(
    artwork: SavedArtwork,
    *,
    allow_legacy_coordinates: bool = True,
) -> Optional[MuseumResolutionEvidence]:
    """Read capture evidence without mutating legacy artwork location payloads."""
    evidence = museum_evidence_from_location(artwork.location, artwork_id=str(artwork.id))
    if evidence or not allow_legacy_coordinates or not isinstance(artwork.location, Mapping):
        return evidence

    source = artwork.location.get("source")
    if source not in (None, ""):
        return None
    latitude = _float_or_none(artwork.location.get("latitude"))
    longitude = _float_or_none(artwork.location.get("longitude"))
    if latitude is None or longitude is None:
        return None
    return MuseumResolutionEvidence(
        artwork_id=str(artwork.id),
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=_float_or_none(artwork.location.get("accuracy_meters")),
        observed_at=str(artwork.location.get("position_timestamp") or artwork.photo_time or "") or None,
        source="legacy_artwork_location",
    )


def select_artworks_for_evaluation(
    db: Session,
    *,
    artwork_ids: Optional[list[str]] = None,
    limit: int = 20,
    allow_legacy_coordinates: bool = True,
    only_unresolved: bool = False,
) -> list[tuple[SavedArtwork, MuseumResolutionEvidence]]:
    if limit < 1:
        return []
    query = db.query(SavedArtwork).filter(SavedArtwork.active_filter())
    if only_unresolved:
        query = query.filter(SavedArtwork.capture_museum_entity_id.is_(None))
    if artwork_ids:
        query = query.filter(SavedArtwork.id.in_(artwork_ids))
    selected: list[tuple[SavedArtwork, MuseumResolutionEvidence]] = []
    artworks = query.order_by(SavedArtwork.created_at.desc(), SavedArtwork.id).yield_per(100)
    for artwork in artworks:
        evidence = evidence_for_evaluation(
            artwork,
            allow_legacy_coordinates=allow_legacy_coordinates,
        )
        if evidence:
            selected.append((artwork, evidence))
        if len(selected) >= limit:
            break
    return selected


def _row(
    artwork: SavedArtwork,
    evidence: MuseumResolutionEvidence,
    bucket: EvaluationBucket,
    reason: str,
    **values: Any,
) -> ArtworkEvaluation:
    return ArtworkEvaluation(
        artwork_id=str(artwork.id),
        artwork_name=artwork.artwork_name,
        bucket=bucket,
        reason=reason,
        evidence_source=evidence.source,
        latitude=evidence.latitude,
        longitude=evidence.longitude,
        accuracy_meters=evidence.accuracy_meters,
        current_museum_entity_id=artwork.capture_museum_entity_id,
        **values,
    )


async def evaluate_artwork(
    db: Session,
    artwork: SavedArtwork,
    evidence: MuseumResolutionEvidence,
    *,
    local_only: bool = False,
    local_resolver: LocalResolver = resolve_museum,
    discoverer: Discoverer = discover_museum_candidate,
) -> ArtworkEvaluation:
    try:
        local_result = local_resolver(db, evidence)
        if local_result.status == "resolved" and local_result.museum_entity_id:
            museum = db.get(MuseumEntity, local_result.museum_entity_id)
            return _row(
                artwork,
                evidence,
                "local_match",
                local_result.reason or "single_nearby_museum",
                resolved_museum_entity_id=local_result.museum_entity_id,
                resolved_museum_name=museum.canonical_name if museum else None,
                distance_meters=local_result.distance_meters,
            )
        local_was_ambiguous = local_result.status == "ambiguous"
        if local_was_ambiguous and local_only:
            return _row(artwork, evidence, "ambiguous", local_result.reason or "local_ambiguity")
        if local_result.status == "invalid_evidence":
            return _row(artwork, evidence, "invalid_evidence", local_result.reason or "invalid_evidence")
        if not local_was_ambiguous and local_result.reason != "no_nearby_museum":
            return _row(artwork, evidence, "unresolved", local_result.reason or "local_unresolved")
        if local_only:
            return _row(artwork, evidence, "unresolved", "discovery_disabled_local_only")

        discovery = await discoverer(evidence)
        candidate_values = {
            "candidate_name": discovery.candidate.name if discovery.candidate else None,
            "candidate_wikidata_qid": discovery.candidate.wikidata_qid if discovery.candidate else None,
            "candidate_distance_meters": discovery.candidate.distance_meters if discovery.candidate else None,
        }
        if discovery.status == "proposed":
            if local_was_ambiguous and not (
                discovery.candidate
                and discovery.candidate.footprint_distance_meters is not None
                and discovery.reason == "validated_physical_venue_footprint"
            ):
                return _row(
                    artwork,
                    evidence,
                    "ambiguous",
                    local_result.reason or "local_ambiguity",
                    **candidate_values,
                )
            catalogue_match = find_matching_museum_for_discovery(db, discovery)
            return _row(
                artwork,
                evidence,
                "proposed",
                discovery.reason,
                catalogue_action="reuse" if catalogue_match else "create",
                catalogue_match_id=str(catalogue_match.id) if catalogue_match else None,
                **candidate_values,
            )
        if local_was_ambiguous:
            return _row(
                artwork,
                evidence,
                "ambiguous",
                local_result.reason or "local_ambiguity",
                **candidate_values,
            )
        if discovery.status == "ambiguous":
            bucket: EvaluationBucket = "ambiguous"
        elif discovery.status == "rejected":
            bucket = "rejected"
        elif discovery.status == "error":
            bucket = "provider_error"
        else:
            bucket = "unresolved"
        return _row(artwork, evidence, bucket, discovery.reason, **candidate_values)
    except Exception as exc:
        return _row(
            artwork,
            evidence,
            "provider_error",
            f"uncaught:{type(exc).__name__}",
            crashed=True,
        )


async def evaluate_artworks(
    db: Session,
    artworks: list[tuple[SavedArtwork, MuseumResolutionEvidence]],
    *,
    local_only: bool = False,
    local_resolver: LocalResolver = resolve_museum,
    discoverer: Discoverer = discover_museum_candidate,
) -> EvaluationReport:
    rows = [
        await evaluate_artwork(
            db,
            artwork,
            evidence,
            local_only=local_only,
            local_resolver=local_resolver,
            discoverer=discoverer,
        )
        for artwork, evidence in artworks
    ]
    counts = Counter(row.bucket for row in rows)
    actions = Counter(row.catalogue_action for row in rows if row.catalogue_action)
    return EvaluationReport(
        total=len(rows),
        counts=dict(sorted(counts.items())),
        proposed_catalogue_actions=dict(sorted(actions.items())),
        rows=rows,
    )
