import pytest
from pydantic import ValidationError

from app.database.models import ArtworkEvent, MuseumEntity, SavedArtwork, User
from app.main import app
from app.models.capture_location import CaptureLocationUpdate
from app.services.authorization_service import RequestPrincipal, get_request_principal
from app.services.capture_location_service import update_capture_location
from app.services.museum import resolver
from tests.conftest import TestingSessionLocal


@pytest.fixture
def location_data():
    with TestingSessionLocal() as db:
        user = User(user_id="location-owner", device_id="location-owner")
        db.add(user)
        db.add(MuseumEntity(id="old-museum", canonical_name="Old Museum", latitude=10, longitude=10, status="active"))
        db.add(MuseumEntity(id="new-museum", canonical_name="New Museum", latitude=20, longitude=20, status="active"))
        db.flush()
        db.add(SavedArtwork(id="location-art", user_id=user.user_id, photo_uri="r2://example",
                            artist_name="Artist", artwork_name="Artwork", museum_name="Legacy museum",
                            capture_museum_entity_id="old-museum",
                            location={"latitude": 10, "longitude": 10, "source": "image_exif"}))
        db.commit()
        principal = RequestPrincipal(state="authenticated", user_id=user.user_id, user=user)
        yield principal


def _patch(client, principal, payload):
    app.dependency_overrides[get_request_principal] = lambda: principal
    try:
        return client.patch("/api/artworks/location-art/capture-location", json=payload)
    finally:
        app.dependency_overrides.pop(get_request_principal, None)


def test_replace_remove_and_manual_persist_without_changing_gps(client, location_data, monkeypatch):
    monkeypatch.setattr(resolver, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(resolver, "resolve_museum", lambda *_: pytest.fail("User override must skip resolution"))
    for update in [
        {"status": "selected", "source": "museum", "museum_id": "new-museum"},
        {"status": "selected", "source": "manual", "name": "A café"},
        {"status": "removed"},
    ]:
        response = _patch(client, location_data, update)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["capture_location_override"] == update
        assert result["capture_museum_entity_id"] == ("new-museum" if update.get("source") == "museum" else None)
        assert (result["capture_museum"] or {}).get("id") == result["capture_museum_entity_id"]
        if update.get("source") == "museum":
            assert result["capture_museum"]["latitude"] == 20
            assert result["capture_museum"]["longitude"] == 20
        resolver.resolve_artwork_capture_museum("location-art")
        with TestingSessionLocal() as db:
            saved = db.get(SavedArtwork, "location-art")
            assert saved.capture_location_override == update
            assert saved.location == {"latitude": 10, "longitude": 10, "source": "image_exif"}
    # Ordinary artwork editing cannot replace the separate capture-place decision.
    assert client.put("/api/artworks/location-art", json={"artwork_name": "Corrected title"}).status_code == 200
    with TestingSessionLocal() as db:
        assert db.get(SavedArtwork, "location-art").capture_location_override == {"status": "removed"}


def test_apple_place_links_exact_existing_museum_but_does_not_store_search_details(client, location_data):
    response = _patch(client, location_data, {
        "status": "selected", "source": "apple_maps", "place_id": "apple-example",
        "match_hint": {"name": "New Museum", "latitude": 20, "longitude": 20},
    })
    assert response.status_code == 200
    assert response.json()["capture_museum_entity_id"] == "new-museum"
    assert response.json()["capture_location_override"] == {
        "status": "selected", "source": "apple_maps", "place_id": "apple-example"}
    with TestingSessionLocal() as db:
        event = db.query(ArtworkEvent).filter_by(event_type="artwork_capture_location_updated").one()
        assert "match_hint" not in event.payload
        assert "latitude" not in str(event.payload)
        assert db.query(MuseumEntity).count() == 2


@pytest.mark.parametrize("name", ["Café next door", "Unknown gallery"])
def test_nonmuseum_or_unknown_place_does_not_use_nearest_museum(client, location_data, name):
    response = _patch(client, location_data, {
        "status": "selected", "source": "apple_maps", "place_id": "other-place",
        "match_hint": {"name": name, "latitude": 20, "longitude": 20},
    })
    assert response.status_code == 200
    assert response.json()["capture_museum"] is None


def test_ambiguous_same_name_place_stays_unlinked(client, location_data):
    with TestingSessionLocal() as db:
        db.add(MuseumEntity(canonical_name="New Museum", latitude=20.0001, longitude=20, status="active"))
        db.commit()
    response = _patch(client, location_data, {
        "status": "selected", "source": "apple_maps", "place_id": "ambiguous-place",
        "match_hint": {"name": "New Museum", "latitude": 20, "longitude": 20},
    })
    assert response.status_code == 200
    assert response.json()["capture_museum"] is None


def test_auth_ownership_and_invalid_museum_leave_record_unchanged(client, location_data):
    assert _patch(client, None, {"status": "removed"}).status_code == 401
    other = RequestPrincipal(state="authenticated", user_id="other-user", user=location_data.user)
    assert _patch(client, other, {"status": "removed"}).status_code == 404
    guest = RequestPrincipal(state="guest", user_id=location_data.user_id, user=location_data.user)
    assert _patch(client, guest, {"status": "removed"}).status_code == 403
    assert _patch(client, location_data, {"status": "selected", "source": "museum", "museum_id": "missing"}).status_code == 422
    with TestingSessionLocal() as db:
        saved = db.get(SavedArtwork, "location-art")
        assert saved.capture_location_override is None
        assert saved.capture_museum_entity_id == "old-museum"


def test_stale_automatic_result_cannot_overwrite_manual_removal(location_data):
    with TestingSessionLocal() as db:
        saved = db.get(SavedArtwork, "location-art")
        saved.capture_museum_entity_id = None
        db.commit()
    # Resolver has already read the old automatic state when the user intervenes.
    with TestingSessionLocal() as stale, TestingSessionLocal() as edit:
        assert stale.get(SavedArtwork, "location-art").capture_location_override is None
        update_capture_location(edit, "location-art", CaptureLocationUpdate(status="removed"), location_data)
        assert not resolver._associate_if_automatic(stale, "location-art", "old-museum")
        stale.commit()
    with TestingSessionLocal() as db:
        assert db.get(SavedArtwork, "location-art").capture_museum_entity_id is None


def test_analysis_persistence_preserves_user_location_and_original_evidence(location_data):
    from app.services.artwork_analysis_service import apply_analysis_to_saved_artwork
    with TestingSessionLocal() as db:
        update_capture_location(db, "location-art", CaptureLocationUpdate(
            status="selected", source="manual", name="Street art"), location_data)
    with TestingSessionLocal() as db:
        saved = db.get(SavedArtwork, "location-art")
        original = dict(saved.location)
        apply_analysis_to_saved_artwork(db, saved, {
            "artist_name": "Unknown Artist", "artwork_name": "New result", "analysis": "Updated analysis",
            "movement": None, "period_bucket": None, "date": None, "medium": None, "tags": [],
        }, None)
        db.commit()
    with TestingSessionLocal() as db:
        saved = db.get(SavedArtwork, "location-art")
        assert saved.location == original
        assert saved.capture_location_override["name"] == "Street art"
        assert saved.capture_museum_entity_id is None


@pytest.mark.parametrize("payload", [
    {"status": "removed", "name": "Place"},
    {"status": "selected", "source": "manual", "name": "   "},
    {"status": "selected", "source": "apple_maps", "place_id": "id", "name": "Provider data"},
    {"status": "selected", "source": "apple_maps", "place_id": "id", "match_hint": {"name": "Place", "latitude": float("nan"), "longitude": 0}},
    {"status": "selected", "source": "museum", "museum_id": "id", "place_id": "apple-id"},
])
def test_invalid_location_shape(payload):
    with pytest.raises(ValidationError):
        CaptureLocationUpdate.model_validate(payload)
