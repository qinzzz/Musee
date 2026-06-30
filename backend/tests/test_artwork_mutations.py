from app.database.models import ArtworkEvent, SavedArtwork, Session as SessionModel, SessionArtwork, User
from tests.conftest import TestingSessionLocal


class _InsightService:
    async def get_insights(self, *, artist_name, artwork_name, language):
        return [
            {
                "title": f"{artist_name} insight",
                "text": f"{artwork_name} in {language or 'default'}",
            }
        ]


def test_update_artwork_updates_fields_and_tags(client):
    with TestingSessionLocal() as db:
        db.add(User(user_id="mutate-user", device_id="mutate-user"))
        artwork = SavedArtwork(
            id="art-mutate",
            user_id="mutate-user",
            photo_uri="r2://art-mutate",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            params={},
            is_recognized=0,
        )
        db.add(artwork)
        db.commit()

    response = client.put(
        "/api/artworks/art-mutate",
        json={
            "artist_name": "Hilma af Klint",
            "artwork_name": "The Swan",
            "summary": "Short summary",
            "analysis": "Full analysis",
            "date": "1915",
            "medium": "Oil on canvas",
            "tags": "symbolism, abstract",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["artist_name"] == "Hilma af Klint"
    assert body["artwork_name"] == "The Swan"
    assert body["date"] == "1915"
    assert body["medium"] == "Oil on canvas"
    assert body["is_recognized"] == 1

    with TestingSessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == "art-mutate").one()
        assert artwork.artist_name == "Hilma af Klint"
        assert artwork.artwork_name == "The Swan"
        assert artwork.summary == "Short summary"
        assert artwork.analysis == "Full analysis"
        assert artwork.params["date"] == "1915"
        assert artwork.params["medium"] == "Oil on canvas"
        assert {tag.name for tag in artwork.artwork_tags} == {"#symbolism", "#abstract"}
        events = (
            db.query(ArtworkEvent)
            .filter(ArtworkEvent.artwork_id == "art-mutate")
            .order_by(ArtworkEvent.created_at.asc())
            .all()
        )
        assert [event.event_type for event in events] == ["artwork_metadata_updated"]
        assert events[0].payload["updated_fields"] == [
            "analysis",
            "artist_name",
            "artwork_name",
            "date",
            "medium",
            "summary",
        ]


def test_update_artwork_refreshes_linked_session_title(client):
    with TestingSessionLocal() as db:
        db.add(User(user_id="session-title-user", device_id="session-title-user"))
        db.add(SessionModel(id="sess-title", user_id="session-title-user", title="Untitled Session"))
        artwork = SavedArtwork(
            id="art-session-title",
            user_id="session-title-user",
            photo_uri="r2://art-session-title",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            params={},
            is_recognized=0,
        )
        db.add(artwork)
        db.flush()
        db.add(SessionArtwork(session_id="sess-title", artwork_id="art-session-title", sequence_number=1, source="upload"))
        db.commit()

    response = client.put(
        "/api/artworks/art-session-title",
        json={"artist_name": "Claude Monet", "artwork_name": "Water Lilies"},
    )

    assert response.status_code == 200

    with TestingSessionLocal() as db:
        session = db.query(SessionModel).filter(SessionModel.id == "sess-title").one()
        assert session.title == "Claude Monet"


def test_get_or_create_artwork_insights_persists_cache(client, monkeypatch):
    monkeypatch.setattr(
        "app.services.artwork_mutation_service.AIServiceFactory.get_service",
        lambda _provider: _InsightService(),
    )

    with TestingSessionLocal() as db:
        db.add(User(user_id="insight-user", device_id="insight-user"))
        artwork = SavedArtwork(
            id="art-insight",
            user_id="insight-user",
            photo_uri="r2://art-insight",
            artist_name="Hilma af Klint",
            artwork_name="The Swan",
            params={},
            is_recognized=1,
        )
        db.add(artwork)
        db.commit()

    response = client.post("/api/artworks/art-insight/insights", params={"language": "en"})

    assert response.status_code == 200
    assert response.json() == {
        "insights": [{"title": "Hilma af Klint insight", "text": "The Swan in en"}]
    }

    with TestingSessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == "art-insight").one()
        assert artwork.insights == [{"title": "Hilma af Klint insight", "text": "The Swan in en"}]
