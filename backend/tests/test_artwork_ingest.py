import io

from fastapi.testclient import TestClient

from app.database.models import SavedArtwork, Session as SessionModel, User
from app.main import app
from app.models.artwork import AIProvider
from app.routers import artwork_ingest
from tests.conftest import TestingSessionLocal


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
