import asyncio
from datetime import datetime

import pytest

from app.database.models import MuseumEntity, SavedArtwork
from app.services.museum.contracts import MuseumResolutionEvidence, MuseumResolutionResult
from app.services.museum.evaluation import (
    ArtworkEvaluation,
    EvaluationReport,
    apply_local_matches,
    evaluate_artwork,
    evaluate_artworks,
    evidence_for_evaluation,
    select_artworks_for_evaluation,
)
from app.services.museum.osm_discovery import MuseumDiscoveryResult, OSMMuseumCandidate


def _artwork(artwork_id="artwork-1", location=None, museum_id=None):
    return SavedArtwork(
        id=artwork_id,
        photo_uri=f"r2://{artwork_id}.jpg",
        artist_name="Unknown Artist",
        artwork_name=f"Artwork {artwork_id}",
        location=location,
        params={},
        capture_museum_entity_id=museum_id,
    )


def _location(source="device_live"):
    payload = {
        "latitude": 37.7857,
        "longitude": -122.4010,
        "accuracy_meters": 15,
    }
    if source is not None:
        payload["source"] = source
    return payload


def _evidence(artwork_id="artwork-1"):
    return MuseumResolutionEvidence(
        latitude=37.7857,
        longitude=-122.4010,
        accuracy_meters=15,
        source="device_live",
        artwork_id=artwork_id,
    )


def _candidate(qid="Q913672"):
    return OSMMuseumCandidate(
        "way", "123", "SFMOMA", 37.7857, -122.4010, 8.0, qid,
    )


def test_evaluation_uses_explicit_capture_evidence():
    artwork = _artwork(location=_location())

    evidence = evidence_for_evaluation(artwork)

    assert evidence is not None
    assert evidence.source == "device_live"
    assert evidence.accuracy_meters == 15


def test_evaluation_can_label_source_less_coordinates_as_legacy():
    artwork = _artwork(location=_location(source=None))

    evidence = evidence_for_evaluation(artwork)

    assert evidence is not None
    assert evidence.source == "legacy_artwork_location"
    assert evidence_for_evaluation(artwork, allow_legacy_coordinates=False) is None


def test_evaluation_does_not_reinterpret_an_unknown_explicit_source():
    artwork = _artwork(location=_location(source="map_pin"))

    assert evidence_for_evaluation(artwork) is None


def test_selection_returns_only_active_artworks_with_usable_geo(db):
    valid = _artwork("valid", _location())
    legacy = _artwork("legacy", _location(source=None))
    invalid = _artwork("invalid", {"city": "San Francisco"})
    deleted = _artwork("deleted", _location())
    deleted.deleted_at = datetime.now()
    db.add_all([valid, legacy, invalid, deleted])
    db.commit()

    selected = select_artworks_for_evaluation(db, limit=10)

    assert {artwork.id for artwork, _ in selected} == {"valid", "legacy"}


def test_selection_can_exclude_already_resolved_artworks(db):
    museum = MuseumEntity(
        id="museum-1",
        canonical_name="SFMOMA",
        latitude=37.7857,
        longitude=-122.4010,
    )
    unresolved = _artwork("unresolved", _location())
    resolved = _artwork("resolved", _location(), museum_id=museum.id)
    db.add_all([museum, unresolved, resolved])
    db.commit()

    selected = select_artworks_for_evaluation(db, limit=10, only_unresolved=True)

    assert [artwork.id for artwork, _ in selected] == ["unresolved"]


def test_local_match_reports_catalogue_identity(db):
    museum = MuseumEntity(
        id="museum-1",
        canonical_name="SFMOMA",
        latitude=37.7857,
        longitude=-122.4010,
    )
    artwork = _artwork(location=_location())
    db.add_all([museum, artwork])
    db.commit()

    def local_match(_db, _evidence):
        return MuseumResolutionResult("resolved", "museum-1", 7.5, "nearest")

    row = asyncio.run(evaluate_artwork(db, artwork, _evidence(), local_resolver=local_match))

    assert row.bucket == "local_match"
    assert row.resolved_museum_name == "SFMOMA"
    assert row.distance_meters == 7.5


def test_local_ambiguity_runs_conservative_footprint_discovery(db):
    artwork = _artwork(location=_location())
    called = False

    def ambiguous(_db, _evidence):
        return MuseumResolutionResult("ambiguous", reason="multiple_plausible_museums")

    async def discovery(_evidence):
        nonlocal called
        called = True
        return MuseumDiscoveryResult("unresolved", "no_containing_footprint")

    row = asyncio.run(evaluate_artwork(
        db, artwork, _evidence(), local_resolver=ambiguous, discoverer=discovery,
    ))

    assert row.bucket == "ambiguous"
    assert called is True


def test_local_only_stops_before_network_discovery(db):
    artwork = _artwork(location=_location())
    called = False

    def no_match(_db, _evidence):
        return MuseumResolutionResult("unresolved", reason="no_nearby_museum")

    async def discovery(_evidence):
        nonlocal called
        called = True
        return MuseumDiscoveryResult("unresolved", "unexpected")

    row = asyncio.run(evaluate_artwork(
        db,
        artwork,
        _evidence(),
        local_only=True,
        local_resolver=no_match,
        discoverer=discovery,
    ))

    assert row.bucket == "unresolved"
    assert row.reason == "discovery_disabled_local_only"
    assert called is False


@pytest.mark.parametrize(
    ("status", "expected_bucket"),
    [
        ("ambiguous", "ambiguous"),
        ("unresolved", "unresolved"),
        ("rejected", "rejected"),
        ("error", "provider_error"),
    ],
)
def test_discovery_outcomes_map_to_report_buckets(db, status, expected_bucket):
    artwork = _artwork(location=_location())

    def no_match(_db, _evidence):
        return MuseumResolutionResult("unresolved", reason="no_nearby_museum")

    async def discovery(_evidence):
        return MuseumDiscoveryResult(status, f"{status}_reason", _candidate())

    row = asyncio.run(evaluate_artwork(
        db, artwork, _evidence(), local_resolver=no_match, discoverer=discovery,
    ))

    assert row.bucket == expected_bucket
    assert row.reason == f"{status}_reason"


def test_proposal_reports_create_or_reuse_without_writing(db):
    existing = MuseumEntity(
        id="museum-existing",
        canonical_name="SFMOMA",
        latitude=37.7,
        longitude=-122.4,
        wikidata_qid="Q913672",
    )
    create_artwork = _artwork("create", _location())
    reuse_artwork = _artwork("reuse", _location())
    db.add_all([existing, create_artwork, reuse_artwork])
    db.commit()

    def no_match(_db, _evidence):
        return MuseumResolutionResult("unresolved", reason="no_nearby_museum")

    async def create_discovery(_evidence):
        return MuseumDiscoveryResult("proposed", "validated", _candidate("Q-new"))

    async def reuse_discovery(_evidence):
        return MuseumDiscoveryResult("proposed", "validated", _candidate())

    create_row = asyncio.run(evaluate_artwork(
        db, create_artwork, _evidence("create"), local_resolver=no_match,
        discoverer=create_discovery,
    ))
    reuse_row = asyncio.run(evaluate_artwork(
        db, reuse_artwork, _evidence("reuse"), local_resolver=no_match,
        discoverer=reuse_discovery,
    ))

    assert create_row.catalogue_action == "create"
    assert reuse_row.catalogue_action == "reuse"
    assert reuse_row.catalogue_match_id == "museum-existing"
    assert db.query(MuseumEntity).count() == 1
    assert create_artwork.capture_museum_entity_id is None


def test_batch_isolates_crashes_and_aggregates(db):
    first = _artwork("first", _location())
    second = _artwork("second", _location())

    def crashing_local(_db, evidence):
        if evidence.artwork_id == "first":
            raise RuntimeError("boom")
        return MuseumResolutionResult("ambiguous", reason="multiple")

    async def no_footprint_discovery(_evidence):
        return MuseumDiscoveryResult("unresolved", "no_containing_footprint")

    report = asyncio.run(evaluate_artworks(
        db,
        [(first, _evidence("first")), (second, _evidence("second"))],
        local_resolver=crashing_local,
        discoverer=no_footprint_discovery,
    ))

    assert report.total == 2
    assert report.counts == {"ambiguous": 1, "provider_error": 1}
    assert report.rows[0].crashed is True
    assert report.rows[1].bucket == "ambiguous"


def test_apply_local_matches_writes_only_unassociated_terminal_matches(db):
    first_museum = MuseumEntity(
        id="museum-1",
        canonical_name="Museum One",
        latitude=37.7857,
        longitude=-122.4010,
    )
    second_museum = MuseumEntity(
        id="museum-2",
        canonical_name="Museum Two",
        latitude=37.7860,
        longitude=-122.4020,
    )
    eligible = _artwork("eligible", _location())
    ambiguous = _artwork("ambiguous", _location())
    already_linked = _artwork("already-linked", _location(), museum_id=second_museum.id)
    db.add_all([first_museum, second_museum, eligible, ambiguous, already_linked])
    db.commit()

    def row(
        artwork_id: str,
        bucket: str,
        resolved_museum_entity_id: str | None,
    ) -> ArtworkEvaluation:
        return ArtworkEvaluation(
            artwork_id=artwork_id,
            artwork_name=artwork_id,
            bucket=bucket,
            reason="test",
            evidence_source="device_live",
            latitude=37.7857,
            longitude=-122.4010,
            accuracy_meters=15,
            resolved_museum_entity_id=resolved_museum_entity_id,
        )

    report = EvaluationReport(
        total=3,
        counts={"local_match": 2, "ambiguous": 1},
        proposed_catalogue_actions={},
        rows=[
            row("eligible", "local_match", first_museum.id),
            row("ambiguous", "ambiguous", first_museum.id),
            row("already-linked", "local_match", first_museum.id),
        ],
    )

    applied = apply_local_matches(db, report)
    db.commit()
    db.expire_all()

    assert applied == 1
    assert db.get(SavedArtwork, "eligible").capture_museum_entity_id == first_museum.id
    assert db.get(SavedArtwork, "ambiguous").capture_museum_entity_id is None
    assert (
        db.get(SavedArtwork, "already-linked").capture_museum_entity_id
        == second_museum.id
    )
