from app.database.models import SavedArtwork, User
from tests.conftest import TestingSessionLocal


class _MetadataAIClient:
    async def call_text_only(self, *, prompt, max_tokens, temperature):
        return '{"movement": "Abstract Art", "period_bucket": "Modern"}'


class _MetadataAIService:
    ai_client = _MetadataAIClient()


def test_enrich_artwork_metadata_updates_matching_artworks(client, monkeypatch):
    monkeypatch.setattr(
        "app.services.artwork_metadata_service.AIServiceFactory.get_service",
        lambda: _MetadataAIService(),
    )
    monkeypatch.setattr(
        "app.services.artwork_metadata_service.get_movement_names",
        lambda: ["Abstract Art", "Minimalism"],
    )

    with TestingSessionLocal() as db:
        db.add(User(user_id="metadata-user", device_id="metadata-user"))
        db.add(
            SavedArtwork(
                id="art-meta-1",
                user_id="metadata-user",
                photo_uri="r2://art-meta-1",
                artist_name="A",
                artwork_name="Work One",
                analysis="Some analysis text",
                movement=None,
                period_bucket=None,
            )
        )
        db.add(
            SavedArtwork(
                id="art-meta-2",
                user_id="metadata-user",
                photo_uri="r2://art-meta-2",
                artist_name="B",
                artwork_name="Work Two",
                analysis="Some analysis text",
                movement="Existing Movement",
                period_bucket="Historical",
            )
        )
        db.commit()

    response = client.post(
        "/api/artworks/enrich-metadata",
        data={"user_id": "metadata-user", "batch_size": 10},
    )

    assert response.status_code == 200
    assert response.json() == {"enriched": 1, "total_processed": 1}

    with TestingSessionLocal() as db:
        updated = db.query(SavedArtwork).filter(SavedArtwork.id == "art-meta-1").one()
        untouched = db.query(SavedArtwork).filter(SavedArtwork.id == "art-meta-2").one()
        assert updated.movement == "Abstract Art"
        assert updated.period_bucket == "Modern"
        assert untouched.movement == "Existing Movement"
        assert untouched.period_bucket == "Historical"
