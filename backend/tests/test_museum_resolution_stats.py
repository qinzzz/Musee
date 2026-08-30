"""Read-side test for the resolution bucket-distribution stats."""
from contextlib import contextmanager

from app.database.models import ArtworkEvent, SavedArtwork
from scripts.museum_resolution_stats import resolution_stats


def _factory(db):
    @contextmanager
    def _cm():
        yield db
    return _cm


def _event(db, artwork_id, bucket, source, associated):
    db.add(ArtworkEvent(
        artwork_id=artwork_id, event_type="museum_resolution",
        payload={"bucket": bucket, "evidence_source": source, "associated": associated},
    ))


def test_resolution_stats_aggregates(db):
    db.add(SavedArtwork(id="a1", photo_uri="x", artist_name="A", artwork_name="a1"))
    db.commit()
    _event(db, "a1", "footprint", "image_exif", True)
    _event(db, "a1", "footprint", "legacy_artwork_location", True)
    _event(db, "a1", "unresolved", "legacy_artwork_location", False)
    # a non-resolution event must be ignored
    db.add(ArtworkEvent(artwork_id="a1", event_type="artwork_created", payload={}))
    db.commit()

    stats = resolution_stats(_factory(db))
    assert stats["total"] == 3
    assert stats["by_bucket"]["footprint"] == 2
    assert stats["by_bucket"]["unresolved"] == 1
    assert stats["associated"] == 2
    assert stats["association_rate"] == round(2 / 3, 3)
    assert stats["by_bucket_source"]["footprint|image_exif"] == 1
