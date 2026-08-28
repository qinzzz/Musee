from datetime import UTC, datetime

import pytest

from app.database.models import MuseumEntity
from app.services.museum.intake import (
    MuseumIntakeCandidate,
    MuseumIntakeConflict,
    complete_museum_intake,
    intake_museum,
)


def _region_candidate(**overrides):
    values = {
        "source": "wikidata_region",
        "canonical_name": "SFMOMA",
        "latitude": 37.7857,
        "longitude": -122.4009,
        "country_code": "US",
        "wikidata_qid": "Q913672",
    }
    values.update(overrides)
    return MuseumIntakeCandidate(**values)


def _osm_candidate(**overrides):
    values = {
        "source": "osm_wikidata",
        "canonical_name": "San Francisco Museum of Modern Art",
        "latitude": 37.7857,
        "longitude": -122.4009,
        "wikidata_qid": "Q913672",
        "osm_type": "way",
        "osm_id": "123",
        "validated_at": datetime.now(UTC),
    }
    values.update(overrides)
    return MuseumIntakeCandidate(**values)


def test_intake_creates_then_reuses_one_canonical_entity(db):
    created = intake_museum(db, _region_candidate())
    reused = intake_museum(db, _region_candidate())

    assert created.action == "created"
    assert reused.action == "reused"
    assert reused.museum.id == created.museum.id
    assert db.query(MuseumEntity).count() == 1
    assert created.thumbnail_enrichment_needed is True


def test_osm_intake_enriches_existing_wikidata_identity(db):
    original = intake_museum(db, _region_candidate())
    db.commit()

    footprint = {
        "type": "Polygon",
        "coordinates": [[
            [-122.4020, 37.7840],
            [-122.4000, 37.7840],
            [-122.4000, 37.7860],
            [-122.4020, 37.7860],
            [-122.4020, 37.7840],
        ]],
    }
    updated = intake_museum(
        db,
        _osm_candidate(
            footprint_geojson=footprint,
            footprint_source="openstreetmap",
            footprint_license="ODbL-1.0",
        ),
    )

    assert updated.action == "updated"
    assert updated.museum.id == original.museum.id
    assert updated.museum.osm_id == "123"
    assert updated.museum.validation_source == "osm_wikidata"
    assert updated.museum.footprint_min_latitude == 37.7840


def test_region_refresh_preserves_richer_osm_validation(db):
    osm_result = intake_museum(db, _osm_candidate())
    db.commit()

    refreshed = intake_museum(
        db,
        _region_candidate(canonical_name="SFMOMA refreshed", latitude=37.7858),
    )

    assert refreshed.action == "updated"
    assert refreshed.museum.canonical_name == "SFMOMA refreshed"
    assert refreshed.museum.latitude == 37.7858
    assert refreshed.museum.osm_id == "123"
    assert refreshed.museum.validation_source == "osm_wikidata"
    assert refreshed.museum.validated_at == osm_result.museum.validated_at


def test_intake_rejects_conflicting_provider_identities(db):
    first = MuseumEntity(
        canonical_name="First",
        latitude=37.78,
        longitude=-122.40,
        wikidata_qid="Q1",
    )
    second = MuseumEntity(
        canonical_name="Second",
        latitude=37.79,
        longitude=-122.41,
        osm_type="way",
        osm_id="2",
    )
    db.add_all([first, second])
    db.commit()

    with pytest.raises(MuseumIntakeConflict):
        intake_museum(
            db,
            _osm_candidate(wikidata_qid="Q1", osm_type="way", osm_id="2"),
        )


def test_complete_commits_before_dispatching_enrichment(db):
    result = intake_museum(db, _region_candidate())
    dispatched = []

    def dispatcher(museum_ids):
        dispatched.extend(museum_ids)
        assert db.get(MuseumEntity, result.museum.id) is not None

    complete_museum_intake(db, [result], enrichment_dispatcher=dispatcher)

    assert dispatched == [result.museum.id]
