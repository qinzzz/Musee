"""Tests for analyze endpoint validation (no AI calls needed)."""

import io
import pytest


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


def test_analyze_quota_enforcement(client):
    """Quota check raises 402 when user is at limit (DB-backed)."""
    from tests.conftest import TestingSessionLocal
    from app.database.models import User, SavedArtwork, Session as SessionModel

    with TestingSessionLocal() as db:
        u = User(user_id="quota-u", device_id="quota-u", tier="free")
        db.add(u)
        sess = SessionModel(id="sess-quota", user_id="quota-u", title="t")
        db.add(sess)
        db.flush()
        for i in range(20):
            db.add(SavedArtwork(
                photo_uri=f"r2://img{i}", artist_name="A", artwork_name=f"W{i}",
                user_id="quota-u", session_id="sess-quota",
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
