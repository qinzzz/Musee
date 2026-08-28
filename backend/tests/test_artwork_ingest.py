import io

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.database.models import ArtworkEvent, MuseumEntity, SavedArtwork, Session as SessionModel, User
from app.main import app
from app.models.artwork import AIProvider
from app.routers import artwork_ingest
from app.services.authorization_service import RequestPrincipal, get_request_principal
from tests.conftest import TestingSessionLocal


@pytest.fixture(autouse=True)
def authenticated_artwork_ingest_principal(db):
    """Keep ingest behavior tests focused while endpoint policy is tested separately."""
    async def override_principal(request: Request):
        form = await request.form()
        user_id = str(form.get("user_id") or "upload-user")
        user = db.query(User).filter(User.user_id == user_id).first()
        if user is None:
            user = User(user_id=user_id, device_id=user_id, tier="free")
            db.add(user)
            db.commit()
        return RequestPrincipal(state="authenticated", user_id=user_id, user=user)

    app.dependency_overrides[get_request_principal] = override_principal
    yield
    app.dependency_overrides.pop(get_request_principal, None)


class _FakeStorage:
    async def save(self, *_args, **_kwargs):
        return "r2://saved-artwork.jpg"


class _FailingAIService:
    async def identify_artist(self, *_args, **_kwargs):
        raise RuntimeError("identify failed")


class _SuccessfulAIService:
    async def identify_artist(self, *_args, **_kwargs):
        return """
        ```json
        {
          "artist": "Hilma af Klint",
          "title": "The Swan",
          "description": "A symbolic abstract composition.",
          "date": "1915",
          "medium": "Oil on canvas",
          "movement": "Abstract Art",
          "period_bucket": "Modern",
          "tags": ["symbolism", "abstract"]
        }
        ```
        """


def test_artworks_upload_persists_pending_artwork(client, monkeypatch):
    async def fake_process_image(_image):
        return b"image-bytes", {}

    monkeypatch.setattr(artwork_ingest, "process_image", fake_process_image)
    monkeypatch.setattr(artwork_ingest, "get_storage_service", lambda: _FakeStorage())

    response = client.post(
        "/api/artworks/upload",
        files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
        data={"user_id": "upload-user"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["photo_uri"] == "r2://saved-artwork.jpg"
    assert body["analysis_status"] == "pending"
    assert body["artist_name"] == "Unknown Artist"
    assert body["artwork_name"] == "Untitled"

    with TestingSessionLocal() as db:
        saved = db.query(SavedArtwork).filter(SavedArtwork.user_id == "upload-user").all()
        assert len(saved) == 1
        assert saved[0].photo_uri == "r2://saved-artwork.jpg"
        assert saved[0].analysis_status == "pending"
        events = (
            db.query(ArtworkEvent)
            .filter(ArtworkEvent.artwork_id == saved[0].id)
            .order_by(ArtworkEvent.created_at.asc())
            .all()
        )
        assert [event.event_type for event in events] == ["artwork_created"]


def test_artworks_upload_resolves_capture_museum_in_background(client, db, monkeypatch):
    async def fake_process_image(_image):
        return b"image-bytes", {}

    museum = MuseumEntity(
        canonical_name="Musée du Louvre",
        latitude=48.8606,
        longitude=2.3376,
        country_code="FR",
        wikidata_qid="Q19675",
    )
    db.add(museum)
    db.commit()
    museum_id = museum.id

    monkeypatch.setattr(artwork_ingest, "process_image", fake_process_image)
    monkeypatch.setattr(artwork_ingest, "get_storage_service", lambda: _FakeStorage())

    response = client.post(
        "/api/artworks/upload",
        files={"image": ("louvre.jpg", io.BytesIO(b"stub"), "image/jpeg")},
        data={
            "user_id": "museum-upload-user",
            "location": '{"city":"Paris","country":"France"}',
            "latitude": "48.86062",
            "longitude": "2.33761",
            "accuracy_meters": "15",
            "position_timestamp": "1787500000000",
            "location_source": "device_live",
        },
    )

    assert response.status_code == 200
    artwork_id = response.json()["id"]

    with TestingSessionLocal() as verification_db:
        saved = verification_db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).one()
        assert saved.capture_museum_entity_id == museum_id
        assert saved.to_dict()["capture_museum"] == {
            "id": museum_id,
            "canonical_name": "Musée du Louvre",
        }
        assert saved.location["source"] == "device_live"
        assert saved.location["accuracy_meters"] == 15


def test_artworks_upload_does_not_leave_shell_session_when_first_save_fails(monkeypatch):
    async def fake_process_image(_image):
        return b"image-bytes", {}

    def failing_create_saved_artwork(*_args, **_kwargs):
        raise RuntimeError("save failed")

    monkeypatch.setattr(artwork_ingest, "process_image", fake_process_image)
    monkeypatch.setattr(artwork_ingest, "get_storage_service", lambda: _FakeStorage())
    monkeypatch.setattr(artwork_ingest, "create_saved_artwork_record_sync", failing_create_saved_artwork)

    with TestClient(app, raise_server_exceptions=False) as failing_client:
        response = failing_client.post(
            "/api/artworks/upload",
            files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
            data={"user_id": "upload-fail-user", "session_id": "visit-upload-fail"},
        )

    assert response.status_code == 500

    with TestingSessionLocal() as db:
        assert db.query(SessionModel).filter(SessionModel.id == "visit-upload-fail").first() is None
        assert db.query(SavedArtwork).filter(SavedArtwork.user_id == "upload-fail-user").count() == 0


def test_artworks_analyze_marks_failed_when_identify_throws(monkeypatch):
    async def fake_process_image(_image):
        return b"image-bytes", {}

    async def fake_vision_hint(_image_bytes):
        return None, []

    monkeypatch.setattr(artwork_ingest, "process_image", fake_process_image)
    monkeypatch.setattr(artwork_ingest, "get_storage_service", lambda: _FakeStorage())
    monkeypatch.setattr(artwork_ingest, "get_vision_hint", fake_vision_hint)
    monkeypatch.setattr(artwork_ingest, "determine_ai_provider", lambda _model=None: AIProvider.OPENAI)
    monkeypatch.setattr(
        artwork_ingest.AIServiceFactory,
        "get_service",
        lambda _provider: _FailingAIService(),
    )

    with TestClient(app, raise_server_exceptions=False) as failing_client:
        response = failing_client.post(
            "/api/artworks/analyze",
            files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
            data={"user_id": "failed-user"},
        )

    assert response.status_code == 500

    with TestingSessionLocal() as db:
        saved = db.query(SavedArtwork).filter(SavedArtwork.user_id == "failed-user").one()
        assert saved.analysis_status == "failed"
        assert "identify failed" in (saved.analysis_error or "")
        events = (
            db.query(ArtworkEvent)
            .filter(ArtworkEvent.artwork_id == saved.id)
            .order_by(ArtworkEvent.created_at.asc())
            .all()
        )
        assert [event.event_type for event in events] == [
            "artwork_created",
            "artwork_identification_requested",
            "artwork_identification_failed",
        ]


def test_artwork_reanalyze_updates_existing_artwork(client, monkeypatch):
    async def fake_load_stored_image_bytes(*_args, **_kwargs):
        return b"stored-image"

    async def fake_vision_hint(_image_bytes):
        return None, ["https://example.com/ref"]

    monkeypatch.setattr(artwork_ingest, "load_stored_image_bytes", fake_load_stored_image_bytes)
    monkeypatch.setattr(artwork_ingest, "get_vision_hint", fake_vision_hint)
    monkeypatch.setattr(artwork_ingest, "determine_ai_provider", lambda _model=None: AIProvider.OPENAI)
    monkeypatch.setattr(
        artwork_ingest.AIServiceFactory,
        "get_service",
        lambda _provider: _SuccessfulAIService(),
    )

    with TestingSessionLocal() as db:
        db.add(User(user_id="re-user", device_id="re-user"))
        artwork = SavedArtwork(
            photo_uri="r2://existing.jpg",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            user_id="re-user",
            analysis="Old analysis",
            params={},
            is_recognized=0,
            analysis_status="pending",
        )
        db.add(artwork)
        db.commit()
        db.refresh(artwork)
        artwork_id = str(artwork.id)

    response = client.post(f"/api/artworks/{artwork_id}/reanalyze")
    assert response.status_code == 200
    body = response.json()
    assert body["artist_name"] == "Hilma af Klint"
    assert body["artwork_name"] == "The Swan"
    assert body["reference_urls"] == ["https://example.com/ref"]

    with TestingSessionLocal() as db:
        updated = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).one()
        assert updated.artist_name == "Hilma af Klint"
        assert updated.artwork_name == "The Swan"
        assert updated.analysis == "A symbolic abstract composition."
        assert updated.analysis_status == "analyzed"
        assert updated.reference_urls == ["https://example.com/ref"]
        assert updated.params["date"] == "1915"
        assert updated.params["medium"] == "Oil on canvas"
        events = (
            db.query(ArtworkEvent)
            .filter(ArtworkEvent.artwork_id == artwork_id)
            .order_by(ArtworkEvent.created_at.asc())
            .all()
        )
        assert [event.event_type for event in events] == [
            "artwork_reidentification_requested",
            "artwork_reidentification_completed",
        ]
