"""Tests for analyze endpoint validation (no AI calls needed)."""

import io

from app.database.models import SavedArtwork
from tests.conftest import TestingSessionLocal


class _FakeStorage:
    async def save(self, *_args, **_kwargs):
        return "r2://identified-art.jpg"


class _SuccessfulIdentifyService:
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


def test_analyze_missing_image(client):
    """Returns 400 when no image or photo_uri is provided."""
    r = client.post("/api/artwork-analyze", files={
        "image": ("test.jpg", io.BytesIO(b""), "image/jpeg")
    }, data={"user_id": "u1"})
    # Empty file should be rejected or cause a parse failure — not 500
    assert r.status_code in (400, 422)


def test_analyze_stream_missing_image(client):
    """Stream endpoint returns 400 for missing image."""
    r = client.post("/api/artwork-analyze-stream", data={"user_id": "u1"})
    assert r.status_code == 400


def test_analyze_stream_no_user_id(client):
    """Stream endpoint works without user_id (anonymous)."""
    r = client.post("/api/artwork-analyze-stream")
    assert r.status_code == 400  # 400 because image is missing, not 500


def test_analyze_persists_identified_artwork(client, monkeypatch):
    async def fake_process_image(_image):
        return b"image-bytes", {}

    async def fake_vision_hint(_image_bytes):
        return None, ["https://example.com/ref"]

    monkeypatch.setattr("app.routers.artwork_identify.process_image", fake_process_image)
    monkeypatch.setattr("app.routers.artwork_identify.get_vision_hint", fake_vision_hint)
    monkeypatch.setattr("app.routers.artwork_identify.get_storage_service", lambda: _FakeStorage())
    monkeypatch.setattr(
        "app.routers.artwork_identify.AIServiceFactory.get_service",
        lambda _provider: _SuccessfulIdentifyService(),
    )

    response = client.post(
        "/api/artwork-analyze",
        files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
        data={"user_id": "identify-user"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["artist_name"] == "Hilma af Klint"
    assert body["artwork_name"] == "The Swan"
    assert body["photo_uri"] == "r2://identified-art.jpg"
    assert body["tags"] == ["symbolism", "abstract"]

    with TestingSessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.user_id == "identify-user").one()
        assert artwork.artist_name == "Hilma af Klint"
        assert artwork.artwork_name == "The Swan"
        assert artwork.photo_uri == "r2://identified-art.jpg"
        assert artwork.reference_urls == ["https://example.com/ref"]
        assert artwork.analysis_status == "analyzed"
        assert {tag.name for tag in artwork.artwork_tags} == {"#symbolism", "#abstract"}


def test_analyze_quota_enforcement(client):
    """Quota check raises 402 when user is at limit (DB-backed)."""
    from tests.conftest import TestingSessionLocal
    from app.database.models import User, SavedArtwork

    with TestingSessionLocal() as db:
        u = User(user_id="quota-u", device_id="quota-u", tier="free")
        db.add(u)
        for i in range(20):
            db.add(SavedArtwork(
                photo_uri=f"r2://img{i}", artist_name="A", artwork_name=f"W{i}",
                user_id="quota-u",
            ))
        db.commit()

    # Post with a minimal (but non-empty) JPEG to get past image check
    tiny_jpeg = (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
        b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a'
        b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),\x01\x02\x03'
        b'\xff\xd9'
    )
    r = client.post(
        "/api/artwork-analyze-stream",
        files={"image": ("art.jpg", io.BytesIO(tiny_jpeg), "image/jpeg")},
        data={"user_id": "quota-u"},
    )
    assert r.status_code == 402
    body = r.json()
    assert body["detail"]["code"] == "quota_exceeded"
