from datetime import UTC, datetime

from app.database.models import MuseumEntity, SavedArtwork
from app.services.museum import resolver as museum_resolver
from app.services.museum.contracts import MuseumResolutionEvidence
from app.services.museum.osm_discovery import MuseumDiscoveryResult, OSMMuseumCandidate
from app.services.museum.resolver import resolve_museum
from app.services.museum.wikidata_validation import VenueValidationResult
from tests.conftest import TestingSessionLocal


LOUVRE_LATITUDE = 48.8606
LOUVRE_LONGITUDE = 2.3376


def _museum(name: str, latitude: float, longitude: float) -> MuseumEntity:
    return MuseumEntity(
        canonical_name=name,
        latitude=latitude,
        longitude=longitude,
        status="active",
    )


def _add_square_footprint(museum: MuseumEntity, latitude: float, longitude: float, delta=0.001):
    museum.footprint_geojson = {
        "type": "Polygon",
        "coordinates": [[
            [longitude - delta, latitude - delta],
            [longitude + delta, latitude - delta],
            [longitude + delta, latitude + delta],
            [longitude - delta, latitude + delta],
            [longitude - delta, latitude - delta],
        ]],
    }
    museum.footprint_min_latitude = latitude - delta
    museum.footprint_max_latitude = latitude + delta
    museum.footprint_min_longitude = longitude - delta
    museum.footprint_max_longitude = longitude + delta


def test_resolves_exactly_one_nearby_museum(db):
    museum = _museum("Musée du Louvre", LOUVRE_LATITUDE, LOUVRE_LONGITUDE)
    db.add(museum)
    db.commit()

    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=48.86062,
            longitude=2.33761,
            accuracy_meters=15,
            source="device_live",
        ),
    )

    assert result.status == "resolved"
    assert result.museum_entity_id == museum.id
    assert result.distance_meters is not None


def test_resolves_stored_footprint_even_when_center_is_outside_point_radius(db):
    museum = _museum("Large Museum", LOUVRE_LATITUDE + 0.0012, LOUVRE_LONGITUDE)
    _add_square_footprint(museum, LOUVRE_LATITUDE, LOUVRE_LONGITUDE)
    db.add(museum)
    db.commit()

    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=LOUVRE_LATITUDE,
            longitude=LOUVRE_LONGITUDE,
            source="legacy_artwork_location",
        ),
    )

    assert result.status == "resolved"
    assert result.museum_entity_id == museum.id
    assert result.reason == "inside_museum_footprint"
    assert result.distance_meters == 0


def test_leaves_capture_unresolved_when_no_museum_is_nearby(db):
    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=48.86062,
            longitude=2.33761,
            accuracy_meters=15,
            source="device_live",
        ),
    )

    assert result.status == "unresolved"
    assert result.reason == "no_nearby_museum"


def test_leaves_capture_ambiguous_when_two_museums_are_nearby(db):
    db.add_all(
        [
            _museum("Museum A", LOUVRE_LATITUDE, LOUVRE_LONGITUDE),
            _museum("Museum B", 48.86065, 2.33765),
        ]
    )
    db.commit()

    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=48.86062,
            longitude=2.33761,
            accuracy_meters=15,
            source="device_live",
        ),
    )

    assert result.status == "ambiguous"
    assert result.reason == "multiple_plausible_museums"


def test_resolves_clear_nearest_candidate_when_multiple_are_in_radius(db):
    nearest = _museum("Nearest Museum", LOUVRE_LATITUDE, LOUVRE_LONGITUDE)
    runner_up = _museum("Runner-up Museum", 48.86130, 2.3376)
    db.add_all([nearest, runner_up])
    db.commit()

    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=LOUVRE_LATITUDE,
            longitude=LOUVRE_LONGITUDE,
            accuracy_meters=15,
            source="device_live",
        ),
    )

    assert result.status == "resolved"
    assert result.museum_entity_id == nearest.id
    assert result.reason == "nearest_clear_by_distance_gap"


def test_ignores_non_resolution_eligible_entity(db):
    museum = _museum("Umbrella Organization", LOUVRE_LATITUDE, LOUVRE_LONGITUDE)
    museum.is_physical_venue = False
    museum.resolution_eligible = False
    db.add(museum)
    db.commit()

    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=LOUVRE_LATITUDE,
            longitude=LOUVRE_LONGITUDE,
            accuracy_meters=15,
            source="device_live",
        ),
    )

    assert result.status == "unresolved"
    assert result.reason == "no_nearby_museum"


def test_rejects_live_capture_with_poor_accuracy(db):
    db.add(_museum("Musée du Louvre", LOUVRE_LATITUDE, LOUVRE_LONGITUDE))
    db.commit()

    result = resolve_museum(
        db,
        MuseumResolutionEvidence(
            latitude=48.86062,
            longitude=2.33761,
            accuracy_meters=150,
            source="device_live",
        ),
    )

    assert result.status == "invalid_evidence"
    assert result.reason == "unusable_accuracy"


def test_background_resolution_promotes_discovered_museum(monkeypatch):
    with TestingSessionLocal() as db:
        artwork = SavedArtwork(
            photo_uri="r2://discovery.jpg",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            location={
                "latitude": 37.7857,
                "longitude": -122.4010,
                "accuracy_meters": 15,
                "source": "device_live",
            },
            params={},
        )
        db.add(artwork)
        db.commit()
        artwork_id = artwork.id

    validation = VenueValidationResult(
        "eligible", "Q913672", "SFMOMA", 37.7857, -122.4010,
        True, True, False, None, ("museum_class_valid",), datetime.now(UTC),
    )
    discovery = MuseumDiscoveryResult(
        "proposed",
        "validated_physical_venue",
        OSMMuseumCandidate("way", "123", "SFMOMA", 37.7857, -122.4010, 0, "Q913672"),
        validation,
        1,
    )

    async def fake_discovery(_evidence):
        return discovery

    monkeypatch.setattr(museum_resolver, "discover_museum_candidate", fake_discovery)
    museum_resolver.resolve_artwork_capture_museum(artwork_id)

    with TestingSessionLocal() as db:
        saved = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).one()
        museum = db.query(MuseumEntity).one()
        assert saved.capture_museum_entity_id == museum.id
        assert museum.wikidata_qid == "Q913672"


def test_background_ambiguity_uses_discovery_only_as_conservative_footprint_fallback(monkeypatch):
    with TestingSessionLocal() as db:
        db.add_all([
            _museum("Museum A", LOUVRE_LATITUDE, LOUVRE_LONGITUDE),
            _museum("Museum B", 48.86065, 2.33765),
        ])
        artwork = SavedArtwork(
            photo_uri="r2://ambiguous.jpg",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            location={
                "latitude": 48.86062,
                "longitude": 2.33761,
                "accuracy_meters": 15,
                "source": "device_live",
            },
            params={},
        )
        db.add(artwork)
        db.commit()
        artwork_id = artwork.id

    called = False

    async def fake_discovery(_evidence):
        nonlocal called
        called = True
        return MuseumDiscoveryResult("unresolved", "no_containing_osm_footprint")

    monkeypatch.setattr(museum_resolver, "discover_museum_candidate", fake_discovery)
    museum_resolver.resolve_artwork_capture_museum(artwork_id)

    with TestingSessionLocal() as db:
        saved = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).one()
        assert saved.capture_museum_entity_id is None
    assert called is True


def test_background_ambiguity_accepts_validated_containing_footprint(monkeypatch):
    with TestingSessionLocal() as db:
        db.add_all([
            _museum("Museum A", LOUVRE_LATITUDE, LOUVRE_LONGITUDE),
            _museum("Museum B", 48.86065, 2.33765),
        ])
        artwork = SavedArtwork(
            photo_uri="r2://footprint.jpg",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            location={
                "latitude": LOUVRE_LATITUDE,
                "longitude": LOUVRE_LONGITUDE,
                "accuracy_meters": 15,
                "source": "device_live",
            },
            params={},
        )
        db.add(artwork)
        db.commit()
        artwork_id = artwork.id

    footprint = {
        "type": "Polygon",
        "coordinates": [[
            [LOUVRE_LONGITUDE - 0.001, LOUVRE_LATITUDE - 0.001],
            [LOUVRE_LONGITUDE + 0.001, LOUVRE_LATITUDE - 0.001],
            [LOUVRE_LONGITUDE + 0.001, LOUVRE_LATITUDE + 0.001],
            [LOUVRE_LONGITUDE - 0.001, LOUVRE_LATITUDE + 0.001],
            [LOUVRE_LONGITUDE - 0.001, LOUVRE_LATITUDE - 0.001],
        ]],
    }
    validation = VenueValidationResult(
        "eligible", "Q-footprint", "Museum A", LOUVRE_LATITUDE, LOUVRE_LONGITUDE,
        True, True, False, None, ("museum_class_valid",), datetime.now(UTC),
    )
    discovery = MuseumDiscoveryResult(
        "proposed",
        "validated_physical_venue_footprint",
        OSMMuseumCandidate(
                "way", "footprint", "Museum A", LOUVRE_LATITUDE, LOUVRE_LONGITUDE,
                0, "Q-footprint", footprint_geojson=footprint, contains_capture=True,
                footprint_distance_meters=0.0,
            ),
        validation,
        1,
    )

    async def fake_discovery(_evidence):
        return discovery

    monkeypatch.setattr(museum_resolver, "discover_museum_candidate", fake_discovery)
    museum_resolver.resolve_artwork_capture_museum(artwork_id)

    with TestingSessionLocal() as db:
        saved = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).one()
        assert saved.capture_museum_entity_id is not None
        museum = db.get(MuseumEntity, saved.capture_museum_entity_id)
        assert museum is not None
        assert museum.footprint_geojson == footprint
