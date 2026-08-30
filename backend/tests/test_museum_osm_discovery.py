from datetime import UTC, datetime

import httpx
import pytest

from app.database.models import MuseumEntity
from app.services.museum import osm_discovery as osm_discovery_module
from app.services.museum.catalogue import match_or_create_discovered_museum
from app.services.museum.contracts import MuseumResolutionEvidence
from app.services.museum.osm_discovery import (
    MuseumDiscoveryResult,
    OSMMuseumCandidate,
    discover_museum_candidate,
    parse_overpass_candidates,
    select_discovery_candidate,
)
from app.services.museum.wikidata_validation import (
    VenueValidationResult,
    clear_wikidata_validation_cache,
)


def _evidence(accuracy=15):
    return MuseumResolutionEvidence(
        latitude=37.7857,
        longitude=-122.4010,
        accuracy_meters=accuracy,
        source="device_live",
    )


def _candidate(distance=10, qid="Q913672", name="SFMOMA"):
    return OSMMuseumCandidate("way", "123", name, 37.7857, -122.4010, distance, qid)


def _footprint_candidate(distance=150, qid="Q913672", name="SFMOMA"):
    footprint = {
        "type": "Polygon",
        "coordinates": [[
            [-122.4020, 37.7850],
            [-122.4000, 37.7850],
            [-122.4000, 37.7870],
            [-122.4020, 37.7870],
            [-122.4020, 37.7850],
        ]],
    }
    return OSMMuseumCandidate(
        "way", "123", name, 37.7870, -122.4030, distance, qid,
        footprint_geojson=footprint,
        contains_capture=True,
        footprint_distance_meters=0.0,
    )


class FakeOSMProvider:
    def __init__(self, candidates=None, error=None):
        self.candidates = candidates or []
        self.error = error

    async def find_museums(self, *_args, **_kwargs):
        if self.error:
            raise self.error
        return self.candidates


class FakeWikidataClient:
    def __init__(self, entities):
        self.entities = entities

    async def get_entities(self, qids):
        return {qid: self.entities[qid] for qid in qids if qid in self.entities}


def _item_claim(qid):
    return {"mainsnak": {"datavalue": {"value": {"id": qid}}}}


def _museum_entity(name="SFMOMA"):
    return {
        "labels": {"en": {"value": name}},
        "claims": {
            "P31": [_item_claim("Q33506")],
            "P625": [{"mainsnak": {"datavalue": {"value": {
                "latitude": 37.7857, "longitude": -122.4010,
            }}}}],
            "P527": [],
            "P361": [],
            "P749": [],
        },
    }


@pytest.fixture(autouse=True)
def clear_validation_cache():
    clear_wikidata_validation_cache()


def test_parses_only_named_osm_museums():
    payload = {"elements": [
        {"type": "way", "id": 1, "center": {"lat": 37.7857, "lon": -122.4010},
         "tags": {"tourism": "museum", "name": "SFMOMA", "wikidata": "Q913672"}},
        {"type": "node", "id": 2, "lat": 37.7858, "lon": -122.4011,
         "tags": {"tourism": "gallery", "name": "Pizza Gallery"}},
    ]}

    candidates = parse_overpass_candidates(payload, 37.7857, -122.4010)

    assert len(candidates) == 1
    assert candidates[0].wikidata_qid == "Q913672"


def test_footprint_containment_overrides_center_distance():
    payload = {"elements": [{
        "type": "way",
        "id": 1,
        "bounds": {
            "minlat": 37.7850,
            "maxlat": 37.7870,
            "minlon": -122.4020,
            "maxlon": -122.4000,
        },
        "geometry": [
            {"lat": 37.7850, "lon": -122.4020},
            {"lat": 37.7850, "lon": -122.4000},
            {"lat": 37.7870, "lon": -122.4000},
            {"lat": 37.7870, "lon": -122.4020},
            {"lat": 37.7850, "lon": -122.4020},
        ],
        "tags": {"tourism": "museum", "name": "SFMOMA", "wikidata": "Q913672"},
    }]}

    candidates = parse_overpass_candidates(payload, 37.7860, -122.4010)
    result = select_discovery_candidate(candidates, _evidence())

    assert candidates[0].contains_capture is True
    assert candidates[0].footprint_geojson is not None
    assert result.status == "proposed"
    assert result.reason == "capture_inside_osm_footprint"


def test_small_footprint_boundary_buffer_handles_entrance_gps_offset():
    candidate = _footprint_candidate()
    candidate = OSMMuseumCandidate(
        **{
            **candidate.__dict__,
            "contains_capture": False,
            "footprint_distance_meters": 4.0,
        },
    )

    result = select_discovery_candidate([candidate], _evidence())

    assert result.status == "proposed"
    assert result.reason == "capture_near_osm_footprint"


def test_requires_qid_for_proposal():
    result = select_discovery_candidate([_candidate(qid=None)], _evidence())

    assert result.status == "unresolved"
    assert result.reason == "osm_museum_missing_wikidata_qid"


def test_leaves_close_osm_candidates_ambiguous():
    candidates = [_candidate(distance=10), _candidate(distance=40, qid="Q2", name="Museum B")]

    result = select_discovery_candidate(candidates, _evidence())

    assert result.status == "ambiguous"


def test_unique_point_candidate_can_use_conservative_120_meter_fallback():
    result = select_discovery_candidate([_candidate(distance=119.9)], _evidence())

    assert result.status == "proposed"
    assert result.reason == "unique_osm_point_candidate"


def test_unique_point_fallback_stops_beyond_120_meters():
    result = select_discovery_candidate([_candidate(distance=120.1)], _evidence())

    assert result.status == "unresolved"
    assert result.reason == "nearest_osm_museum_too_far"


def test_unique_point_fallback_still_requires_wikidata_identity():
    result = select_discovery_candidate([_candidate(distance=90, qid=None)], _evidence())

    assert result.status == "unresolved"
    assert result.reason == "unique_osm_point_missing_wikidata_qid"


def test_point_fallback_never_relaxes_multiple_candidate_ambiguity():
    result = select_discovery_candidate(
        [_candidate(distance=80), _candidate(distance=100, qid="Q2", name="Museum B")],
        _evidence(),
    )

    assert result.status == "unresolved"
    assert result.reason == "nearest_osm_museum_too_far"


@pytest.mark.asyncio
async def test_validated_physical_venue_is_proposed():
    osm = FakeOSMProvider([_candidate()])
    wikidata = FakeWikidataClient({"Q913672": _museum_entity()})

    result = await discover_museum_candidate(_evidence(), osm_provider=osm, wikidata_client=wikidata)

    assert result.status == "proposed"
    assert result.reason == "validated_physical_venue"
    assert result.validation is not None
    assert result.validation.resolution_eligible is True


@pytest.mark.asyncio
async def test_validated_containing_footprint_ignores_center_cutoff():
    osm = FakeOSMProvider([_footprint_candidate()])
    wikidata = FakeWikidataClient({"Q913672": _museum_entity()})

    result = await discover_museum_candidate(_evidence(), osm_provider=osm, wikidata_client=wikidata)

    assert result.status == "proposed"
    assert result.reason == "validated_physical_venue_footprint"


@pytest.mark.asyncio
async def test_unique_point_fallback_requires_successful_wikidata_validation():
    osm = FakeOSMProvider([_candidate(distance=100)])
    wikidata = FakeWikidataClient({"Q913672": _museum_entity()})

    result = await discover_museum_candidate(_evidence(), osm_provider=osm, wikidata_client=wikidata)

    assert result.status == "proposed"
    assert result.reason == "validated_unique_point_venue"
    assert result.validation is not None
    assert result.validation.resolution_eligible is True


@pytest.mark.asyncio
async def test_provider_failure_is_non_throwing_error_result():
    result = await discover_museum_candidate(
        _evidence(), osm_provider=FakeOSMProvider(error=RuntimeError("offline")),
    )

    assert result.status == "error"
    assert result.reason == "overpass_provider_error"


def test_catalogue_reuses_existing_qid(db):
    existing = MuseumEntity(
        canonical_name="Old name",
        latitude=37.7,
        longitude=-122.4,
        wikidata_qid="Q913672",
    )
    db.add(existing)
    db.commit()
    validation = VenueValidationResult(
        status="eligible",
        qid="Q913672",
        canonical_name="San Francisco Museum of Modern Art",
        latitude=37.7857,
        longitude=-122.4010,
        is_physical_venue=True,
        resolution_eligible=True,
        has_child_venues=False,
        parent_wikidata_qid=None,
        reason_codes=("museum_class_valid",),
        validated_at=datetime.now(UTC),
    )
    discovery = MuseumDiscoveryResult(
        "proposed", "validated_physical_venue", _candidate(), validation, 1,
    )

    resolved = match_or_create_discovered_museum(db, discovery)
    db.commit()

    assert resolved.id == existing.id
    assert db.query(MuseumEntity).count() == 1
    assert resolved.osm_id == "123"


def test_catalogue_persists_footprint_with_osm_license_metadata(db):
    validation = VenueValidationResult(
        status="eligible",
        qid="Q913672",
        canonical_name="SFMOMA",
        latitude=37.7857,
        longitude=-122.4010,
        is_physical_venue=True,
        resolution_eligible=True,
        has_child_venues=False,
        parent_wikidata_qid=None,
        reason_codes=("museum_class_valid",),
        validated_at=datetime.now(UTC),
    )
    discovery = MuseumDiscoveryResult(
        "proposed", "validated_physical_venue_footprint", _footprint_candidate(), validation, 1,
    )

    museum = match_or_create_discovered_museum(db, discovery)
    db.commit()

    assert museum.footprint_geojson is not None
    assert museum.footprint_min_latitude == 37.7850
    assert museum.footprint_max_longitude == -122.4000
    assert museum.footprint_source == "openstreetmap"
    assert museum.footprint_license == "ODbL-1.0"


def test_catalogue_uses_resolved_child_qid_and_name_for_parent_osm_candidate(db):
    parent_candidate = _candidate(qid="QGETTY", name="J. Paul Getty Museum")
    validation = VenueValidationResult(
        status="eligible",
        qid="QCENTER",
        canonical_name="Getty Center",
        latitude=34.0775,
        longitude=-118.4750,
        is_physical_venue=True,
        resolution_eligible=True,
        has_child_venues=False,
        parent_wikidata_qid="QGETTY",
        reason_codes=("resolved_to_nearest_shared_child_venue",),
        validated_at=datetime.now(UTC),
    )
    discovery = MuseumDiscoveryResult(
        "proposed", "validated_physical_venue", parent_candidate, validation, 1,
    )

    museum = match_or_create_discovered_museum(db, discovery)
    db.commit()

    assert museum.wikidata_qid == "QCENTER"
    assert museum.canonical_name == "Getty Center"
    assert museum.parent_wikidata_qid == "QGETTY"
    assert museum.osm_id == parent_candidate.osm_id


@pytest.mark.asyncio
async def test_find_museums_falls_over_to_mirror_on_connection_error(monkeypatch):
    # Primary endpoint refuses; provider should fall over to the mirror and succeed.
    monkeypatch.setattr(osm_discovery_module, "OVERPASS_MAX_ATTEMPTS", 1)
    monkeypatch.setattr(
        osm_discovery_module, "OVERPASS_API_URLS",
        ["https://primary.example/api", "https://mirror.example/api"],
    )
    good = {"elements": [{
        "type": "way", "id": "1",
        "tags": {"tourism": "museum", "name": "Test Museum", "wikidata": "Q1"},
        "center": {"lat": 37.0, "lon": -122.0},
    }]}
    calls = []

    async def fake_post(self, url, **kwargs):
        calls.append(url)
        if url == "https://primary.example/api":
            raise httpx.ConnectError("all connection attempts failed")
        return httpx.Response(200, json=good, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    provider = osm_discovery_module.OverpassMuseumProvider()
    result = await provider.find_museums(37.0, -122.0, 150)

    assert calls == ["https://primary.example/api", "https://mirror.example/api"]
    assert len(result) == 1 and result[0].wikidata_qid == "Q1"


@pytest.mark.asyncio
async def test_find_museums_raises_when_all_endpoints_fail(monkeypatch):
    monkeypatch.setattr(osm_discovery_module, "OVERPASS_MAX_ATTEMPTS", 1)
    monkeypatch.setattr(
        osm_discovery_module, "OVERPASS_API_URLS",
        ["https://a.example/api", "https://b.example/api"],
    )

    async def always_fail(self, url, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx.AsyncClient, "post", always_fail)

    provider = osm_discovery_module.OverpassMuseumProvider()
    with pytest.raises(httpx.ConnectError):
        await provider.find_museums(37.0, -122.0, 150)
