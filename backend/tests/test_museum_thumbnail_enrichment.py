import pytest

from app.services.museum import thumbnail_enrichment
from app.database.models import MuseumEntity, SavedArtwork
from app.services.museum.thumbnail_enrichment import (
    MuseumThumbnail,
    fetch_museum_thumbnail,
    select_museum_ids_for_thumbnail_enrichment,
)


class FakeEntityClient:
    def __init__(self, entity):
        self.entity = entity

    async def get_entities(self, qids):
        return {qids[0]: self.entity}


@pytest.mark.asyncio
async def test_fetch_museum_thumbnail_uses_wikidata_p18(monkeypatch):
    expected = MuseumThumbnail(
        file_name="Museum exterior.jpg",
        url="https://upload.wikimedia.org/thumb.jpg",
        source_url="https://commons.wikimedia.org/wiki/File:Museum_exterior.jpg",
        attribution="Example Photographer",
        license_name="CC BY-SA 4.0",
    )

    async def fake_commons(file_name):
        assert file_name == "Museum exterior.jpg"
        return expected

    monkeypatch.setattr(thumbnail_enrichment, "_fetch_commons_metadata", fake_commons)
    entity = {
        "claims": {
            "P18": [{"mainsnak": {"datavalue": {"value": "Museum exterior.jpg"}}}],
        },
    }

    result = await fetch_museum_thumbnail("Q123", entity_client=FakeEntityClient(entity))

    assert result == expected


@pytest.mark.asyncio
async def test_fetch_museum_thumbnail_returns_none_without_p18(monkeypatch):
    async def unexpected_commons(_file_name):
        raise AssertionError("Commons must not be called without a P18 claim")

    monkeypatch.setattr(thumbnail_enrichment, "_fetch_commons_metadata", unexpected_commons)

    result = await fetch_museum_thumbnail(
        "Q123",
        entity_client=FakeEntityClient({"claims": {}}),
    )

    assert result is None


def test_thumbnail_backfill_selection_can_target_passport_only(db):
    visited = MuseumEntity(
        id="visited",
        canonical_name="Visited Museum",
        latitude=37.78,
        longitude=-122.40,
        wikidata_qid="Q1",
    )
    unvisited = MuseumEntity(
        id="unvisited",
        canonical_name="Unvisited Museum",
        latitude=37.79,
        longitude=-122.41,
        wikidata_qid="Q2",
    )
    already_enriched = MuseumEntity(
        id="enriched",
        canonical_name="Enriched Museum",
        latitude=37.80,
        longitude=-122.42,
        wikidata_qid="Q3",
        thumbnail_url="https://upload.wikimedia.org/existing.jpg",
    )
    artwork = SavedArtwork(
        photo_uri="r2://visited.jpg",
        artist_name="Unknown",
        artwork_name="Visited artwork",
        params={},
        capture_museum_entity_id=visited.id,
    )
    enriched_artwork = SavedArtwork(
        photo_uri="r2://enriched.jpg",
        artist_name="Unknown",
        artwork_name="Enriched artwork",
        params={},
        capture_museum_entity_id=already_enriched.id,
    )
    db.add_all([visited, unvisited, already_enriched, artwork, enriched_artwork])
    db.commit()

    passport_ids = select_museum_ids_for_thumbnail_enrichment(db, passport_only=True)
    catalogue_ids = select_museum_ids_for_thumbnail_enrichment(db, passport_only=False)

    assert passport_ids == [visited.id]
    assert catalogue_ids == [unvisited.id, visited.id]
