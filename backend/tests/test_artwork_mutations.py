import asyncio

from app.database.models import ArtworkEvent, SavedArtwork, Session as SessionModel, SessionArtwork, User
from app.services.artwork_background_service import generate_fun_facts
from tests.conftest import TestingSessionLocal


class _InsightService:
    async def get_fun_facts(self, *, artist_name, artwork_name, language):
        return [
            {
                "title": f"{artist_name} fact",
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


def test_get_or_create_artwork_fun_facts_persists_cache(client, monkeypatch):
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

    response = client.post("/api/artworks/art-insight/fun-facts", params={"language": "en"})

    assert response.status_code == 200
    assert response.json() == {
        "fun_facts": [{"title": "Hilma af Klint fact", "text": "The Swan in en"}]
    }

    with TestingSessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == "art-insight").one()
        assert artwork.insights == [{"title": "Hilma af Klint fact", "text": "The Swan in en"}]


def test_get_or_create_artwork_fun_facts_returns_existing_cache(client, monkeypatch):
    def fail_get_service(_provider):
        raise AssertionError("cached fun facts should not call AI")

    monkeypatch.setattr(
        "app.services.artwork_mutation_service.AIServiceFactory.get_service",
        fail_get_service,
    )

    cached = [{"title": "Cached", "text": "Already generated"}]
    with TestingSessionLocal() as db:
        db.add(User(user_id="cached-insight-user", device_id="cached-insight-user"))
        db.add(
            SavedArtwork(
                id="art-insight-cached",
                user_id="cached-insight-user",
                photo_uri="r2://art-insight-cached",
                artist_name="Hilma af Klint",
                artwork_name="The Swan",
                params={},
                is_recognized=1,
                insights=cached,
            )
        )
        db.commit()

    response = client.post("/api/artworks/art-insight-cached/fun-facts", params={"language": "zh"})

    assert response.status_code == 200
    assert response.json() == {"fun_facts": cached}

    compat_response = client.post("/api/artworks/art-insight-cached/insights", params={"language": "zh"})
    assert compat_response.status_code == 200
    assert compat_response.json() == {"insights": cached}


def test_background_fun_facts_does_not_overwrite_existing_cache(monkeypatch):
    def fail_get_service(_provider):
        raise AssertionError("cached fun facts should not call AI")

    monkeypatch.setattr(
        "app.services.artwork_background_service.AIServiceFactory.get_service",
        fail_get_service,
    )

    cached = [{"title": "Cached", "text": "Keep this"}]
    with TestingSessionLocal() as db:
        db.add(User(user_id="bg-insight-user", device_id="bg-insight-user"))
        db.add(
            SavedArtwork(
                id="art-bg-insight-cached",
                user_id="bg-insight-user",
                photo_uri="r2://art-bg-insight-cached",
                artist_name="Hilma af Klint",
                artwork_name="The Swan",
                params={},
                is_recognized=1,
                insights=cached,
            )
        )
        db.commit()

    asyncio.run(generate_fun_facts("art-bg-insight-cached", "Hilma af Klint", "The Swan", "en"))

    with TestingSessionLocal() as db:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == "art-bg-insight-cached").one()
        assert artwork.insights == cached
