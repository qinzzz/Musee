from app.database.models import ArtworkEntity, SavedArtwork, TasteProfile, User
from tests.conftest import TestingSessionLocal


def _seed_user(user_id: str) -> None:
    with TestingSessionLocal() as db:
        db.add(User(user_id=user_id, device_id=user_id))
        db.commit()


def _create_entity(
    db,
    *,
    artist: str,
    title: str,
    figurative: int,
    emotive: int,
    serene: int,
    classical: int,
    playful: int,
) -> ArtworkEntity:
    entity = ArtworkEntity(
        canonical_artist=artist.lower(),
        canonical_title=title.lower(),
        display_artist=artist,
        display_title=title,
        dim_status="done",
        dim_figurative_abstract=figurative,
        dim_emotive_conceptual=emotive,
        dim_serene_intense=serene,
        dim_classical_avantgarde=classical,
        dim_playful_serious=playful,
    )
    db.add(entity)
    db.flush()
    return entity


def _create_artwork(
    db,
    *,
    user_id: str,
    entity: ArtworkEntity,
    classification: str,
    suffix: str,
) -> SavedArtwork:
    artwork = SavedArtwork(
        photo_uri=f"r2://{suffix}.jpg",
        artist_name=entity.display_artist,
        artwork_name=f"{entity.display_title} {suffix}",
        user_id=user_id,
        artwork_entity_id=entity.id,
        classification=classification,
        analysis_status="analyzed",
        is_recognized=1,
    )
    db.add(artwork)
    db.flush()
    return artwork


def test_taste_profile_view_is_not_ready_below_minimum_threshold(client):
    user_id = "taste-not-ready"
    _seed_user(user_id)

    with TestingSessionLocal() as db:
        love_entity = _create_entity(
            db,
            artist="Artist A",
            title="Work A",
            figurative=1,
            emotive=1,
            serene=0,
            classical=0,
            playful=0,
        )
        reject_entity = _create_entity(
            db,
            artist="Artist B",
            title="Work B",
            figurative=-1,
            emotive=-1,
            serene=0,
            classical=0,
            playful=0,
        )
        _create_artwork(db, user_id=user_id, entity=love_entity, classification="love", suffix="1")
        _create_artwork(db, user_id=user_id, entity=love_entity, classification="love", suffix="2")
        _create_artwork(db, user_id=user_id, entity=reject_entity, classification="not_for_me", suffix="3")
        db.commit()

    response = client.get(f"/api/taste-profile?user_id={user_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["eligible_count"] == 3
    assert body["required_count"] == 5
    assert body["can_generate"] is False
    assert body["is_generated"] is False


def test_generate_taste_profile_persists_profile_snapshot(client, monkeypatch):
    user_id = "taste-generate"
    _seed_user(user_id)

    async def fake_generate_taste_narrative(*_args, **_kwargs):
        return "You consistently prefer bold, conceptual works."

    monkeypatch.setattr(
        "app.services.taste_profile_service.generate_taste_narrative",
        fake_generate_taste_narrative,
    )

    with TestingSessionLocal() as db:
        love_entity = _create_entity(
            db,
            artist="Artist Love",
            title="Love Work",
            figurative=1,
            emotive=1,
            serene=-1,
            classical=1,
            playful=0,
        )
        reject_entity = _create_entity(
            db,
            artist="Artist Reject",
            title="Reject Work",
            figurative=-1,
            emotive=-1,
            serene=1,
            classical=-1,
            playful=0,
        )
        respect_entity = _create_entity(
            db,
            artist="Artist Respect",
            title="Respect Work",
            figurative=0,
            emotive=1,
            serene=1,
            classical=0,
            playful=-1,
        )
        for index in range(3):
            _create_artwork(db, user_id=user_id, entity=love_entity, classification="love", suffix=f"love-{index}")
        for index in range(2):
            _create_artwork(db, user_id=user_id, entity=reject_entity, classification="not_for_me", suffix=f"reject-{index}")
        _create_artwork(db, user_id=user_id, entity=respect_entity, classification="respect", suffix="respect-0")
        db.commit()

    response = client.post("/api/taste-profile/generate", json={"user_id": user_id})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "generated"
    assert body["eligible_count"] == 5
    assert body["is_generated"] is True
    assert body["narrative_summary"] == "You consistently prefer bold, conceptual works."
    assert body["dimension_examples"]
    assert body["taste_vector"]["figurative_abstract"] == 1.0

    with TestingSessionLocal() as db:
        profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).one()
        assert profile.status == "generated"
        assert profile.eligible_count == 5
        assert profile.is_outdated == 0
        assert profile.narrative_summary == "You consistently prefer bold, conceptual works."
        assert len(profile.source_artwork_ids or []) == 6


def test_artwork_classification_change_marks_generated_taste_profile_outdated(client):
    user_id = "taste-invalidate"
    _seed_user(user_id)

    with TestingSessionLocal() as db:
        entity = _create_entity(
            db,
            artist="Artist",
            title="Work",
            figurative=1,
            emotive=0,
            serene=0,
            classical=0,
            playful=0,
        )
        artwork = _create_artwork(db, user_id=user_id, entity=entity, classification="love", suffix="invalidate")
        db.add(
            TasteProfile(
                user_id=user_id,
                status="generated",
                eligible_count=5,
                required_count=5,
                love_count=3,
                reject_count=2,
                respect_count=0,
                is_outdated=0,
            )
        )
        db.commit()
        artwork_id = artwork.id

    response = client.patch(
        f"/api/artworks/{artwork_id}/classification",
        json={"classification": "respect"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["classification"] == "respect"
    assert body["profile_invalidated"] is True

    with TestingSessionLocal() as db:
        profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).one()
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).one()
        assert profile.status == "outdated"
        assert profile.is_outdated == 1
        assert profile.outdated_at is not None
        assert artwork.classification == "respect"
