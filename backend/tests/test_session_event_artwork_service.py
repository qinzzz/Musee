from app.database.models import SavedArtwork, Session as SessionModel, SessionEvent, User
from app.services.session_event_artwork_service import (
    normalize_session_event_artwork_ids,
    sync_session_event_artworks,
)


def test_normalize_session_event_artwork_ids_merges_and_dedupes():
    assert normalize_session_event_artwork_ids(
        artwork_id="art-1",
        artwork_ids=["art-1", "art-2", " ", "art-2"],
    ) == ["art-1", "art-2"]


def test_sync_session_event_artworks_sets_primary_artwork_id(db):
    db.add(User(user_id="event-art-user", device_id="event-art-user"))
    db.add(SessionModel(id="sess-event-art", user_id="event-art-user", title="Test"))
    db.add(SavedArtwork(id="art-a", user_id="event-art-user", photo_uri="r2://a", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SavedArtwork(id="art-b", user_id="event-art-user", photo_uri="r2://b", artist_name="Unknown Artist", artwork_name="Untitled"))
    message = SessionEvent(
        id="msg-event-art",
        session_id="sess-event-art",
        role="model",
        type="artwork_result",
        sequence_number=1,
    )
    db.add(message)
    db.flush()

    inserted = sync_session_event_artworks(
        db,
        session_event=message,
        artwork_ids=["art-a", "art-b"],
    )

    assert inserted == 2
    assert message.artwork_id == "art-a"
