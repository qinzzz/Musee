from fastapi.testclient import TestClient

from app.main import app
from app.routers import artwork_library as artwork_library_router
from app.database.models import ArtistEntity, SavedArtwork, Session as SessionModel, SessionArtwork, SessionMessage, User


def test_get_artworks_returns_user_items(client, db):
    db.add(User(user_id="art-user", device_id="art-user"))
    db.add(SavedArtwork(id="art-1", user_id="art-user", photo_uri="r2://art-1", artist_name="A", artwork_name="W1"))
    db.add(SavedArtwork(id="art-2", user_id="art-user", photo_uri="r2://art-2", artist_name="B", artwork_name="W2"))
    db.commit()

    response = client.get("/api/artworks", params={"user_id": "art-user"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert {item["id"] for item in payload["items"]} == {"art-1", "art-2"}


def test_delete_artwork_keeps_session_after_last_artwork_is_removed(client, db):
    db.add(User(user_id="delete-user", device_id="delete-user"))
    db.add(SessionModel(id="sess-delete", user_id="delete-user", title="Visit"))
    db.add(SavedArtwork(id="art-delete", user_id="delete-user", photo_uri="r2://delete", artist_name="A", artwork_name="W"))
    db.flush()
    db.add(SessionArtwork(session_id="sess-delete", artwork_id="art-delete", sequence_number=1, source="upload"))
    db.commit()

    response = client.delete("/api/artworks/art-delete", params={"user_id": "delete-user"})

    assert response.status_code == 200
    assert db.query(SavedArtwork).filter(SavedArtwork.id == "art-delete").first() is None
    session = db.query(SessionModel).filter(SessionModel.id == "sess-delete").first()
    assert session is not None
    assert session.title == "Untitled Session"


def test_delete_artwork_keeps_session_with_text_messages(client, db):
    db.add(User(user_id="delete-keep-user", device_id="delete-keep-user"))
    db.add(SessionModel(id="sess-keep", user_id="delete-keep-user", title="Visit"))
    db.add(
        SavedArtwork(
            id="art-keep",
            user_id="delete-keep-user",
            photo_uri="r2://keep",
            artist_name="A",
            artwork_name="W",
        )
    )
    db.flush()
    db.add(SessionArtwork(session_id="sess-keep", artwork_id="art-keep", sequence_number=1, source="upload"))
    db.add(
        SessionMessage(
            id="msg-keep",
            session_id="sess-keep",
            role="user",
            type="text",
            content="This work reminds me of home.",
            sequence_number=1,
        )
    )
    db.commit()

    response = client.delete("/api/artworks/art-keep", params={"user_id": "delete-keep-user"})

    assert response.status_code == 200
    assert db.query(SavedArtwork).filter(SavedArtwork.id == "art-keep").first() is None
    assert db.query(SessionModel).filter(SessionModel.id == "sess-keep").first() is not None


def test_batch_delete_artworks_keeps_session_with_text_messages(client, db):
    db.add(User(user_id="batch-keep-user", device_id="batch-keep-user"))
    db.add(SessionModel(id="sess-batch-keep", user_id="batch-keep-user", title="Visit"))
    db.add(
        SavedArtwork(
            id="art-batch-keep",
            user_id="batch-keep-user",
            photo_uri="r2://batch-keep",
            artist_name="A",
            artwork_name="W",
        )
    )
    db.flush()
    db.add(
        SessionArtwork(
            session_id="sess-batch-keep",
            artwork_id="art-batch-keep",
            sequence_number=1,
            source="upload",
        )
    )
    db.add(
        SessionMessage(
            id="msg-batch-keep",
            session_id="sess-batch-keep",
            role="user",
            type="text",
            content="Keeping this reflection should preserve the session.",
            sequence_number=1,
        )
    )
    db.commit()

    response = client.post(
        "/api/artworks/batch-delete",
        json=["art-batch-keep"],
        params={"user_id": "batch-keep-user"},
    )

    assert response.status_code == 200
    assert db.query(SavedArtwork).filter(SavedArtwork.id == "art-batch-keep").first() is None
    assert db.query(SessionModel).filter(SessionModel.id == "sess-batch-keep").first() is not None


def test_backfill_artwork_artist_marks_unknown_artist_as_analyzed(client, db):
    db.add(User(user_id="unknown-artist-user", device_id="unknown-artist-user"))
    db.add(
        SavedArtwork(
            id="art-unknown-artist",
            user_id="unknown-artist-user",
            photo_uri="r2://unknown-artist",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            analysis_status="failed",
            analysis_error="previous error",
        )
    )
    db.commit()

    response = client.post("/api/artworks/art-unknown-artist/artist")

    assert response.status_code == 200
    assert response.json() == {"artist_entity_id": None}

    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == "art-unknown-artist").first()
    assert artwork is not None
    assert artwork.analysis_status == "analyzed"
    assert artwork.analysis_error is None
    assert artwork.analysis_completed_at is not None


def test_backfill_artwork_artist_marks_failure_when_bio_enrichment_raises(monkeypatch, db):
    db.add(User(user_id="bio-fail-user", device_id="bio-fail-user"))
    db.add(
        SavedArtwork(
            id="art-bio-fail",
            user_id="bio-fail-user",
            photo_uri="r2://bio-fail",
            artist_name="Frank Stella",
            artwork_name="Untitled",
            analysis_status="analyzed",
        )
    )
    db.commit()

    async def failing_do_artist_bio(_artist_entity_id: str):
        raise RuntimeError("bio generation failed")

    monkeypatch.setattr(artwork_library_router, "do_artist_bio", failing_do_artist_bio)

    with TestClient(app, raise_server_exceptions=False) as failing_client:
        response = failing_client.post("/api/artworks/art-bio-fail/artist")

    assert response.status_code == 500

    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == "art-bio-fail").first()
    assert artwork is not None
    assert artwork.analysis_status == "failed"
    assert artwork.analysis_error == "bio generation failed"
    assert artwork.analysis_completed_at is not None

    entity = db.query(ArtistEntity).filter(ArtistEntity.canonical_name == "frank stella").first()
    assert entity is not None
