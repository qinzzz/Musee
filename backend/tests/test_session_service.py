from app.database.models import ArtworkEvent, SavedArtwork, Session as SessionModel, SessionArtwork, SessionEvent, User
from app.services.session_service import (
    DEFAULT_SESSION_TITLE,
    SESSION_TITLE_STATE_AUTO,
    SESSION_TITLE_STATE_USER_LOCKED,
    attach_artwork_ids_to_session,
    get_or_create_owned_session,
    refresh_session_title,
)


def _make_user(db, user_id: str = "u1") -> User:
    user = User(user_id=user_id, device_id=user_id)
    db.add(user)
    db.commit()
    return user


def test_refresh_session_title_uses_single_artwork_title(db):
    _make_user(db, "title-user")
    session = SessionModel(id="sess-title", user_id="title-user", title=DEFAULT_SESSION_TITLE)
    artwork = SavedArtwork(
        id="art-1",
        user_id="title-user",
        photo_uri="r2://img-1",
        artist_name="Unknown Artist",
        artwork_name="Water Lilies",
        is_recognized=1,
    )
    db.add(session)
    db.add(artwork)
    db.flush()
    db.add(SessionArtwork(session_id=session.id, artwork_id=artwork.id, sequence_number=1, source="upload"))
    db.flush()

    refresh_session_title(db, session)

    assert session.system_title == "Water Lilies"
    assert session.title == "Water Lilies"
    assert session.title_state == SESSION_TITLE_STATE_AUTO


def test_refresh_session_title_preserves_user_lock(db):
    _make_user(db, "locked-user")
    session = SessionModel(
        id="sess-locked",
        user_id="locked-user",
        title="My Visit",
        user_title="My Visit",
        system_title=DEFAULT_SESSION_TITLE,
        title_state=SESSION_TITLE_STATE_USER_LOCKED,
    )
    artwork = SavedArtwork(
        id="art-locked",
        user_id="locked-user",
        photo_uri="r2://img-locked",
        artist_name="Claude Monet",
        artwork_name="Water Lilies",
        is_recognized=1,
    )
    db.add(session)
    db.add(artwork)
    db.flush()
    db.add(SessionArtwork(session_id=session.id, artwork_id=artwork.id, sequence_number=1, source="upload"))
    db.flush()

    refresh_session_title(db, session)

    assert session.title == "My Visit"
    assert session.user_title == "My Visit"
    assert session.title_state == SESSION_TITLE_STATE_USER_LOCKED
    assert session.system_title == "Claude Monet"


def test_refresh_session_title_uses_first_user_message_when_no_artworks(db):
    _make_user(db, "message-user")
    session = SessionModel(
        id="sess-message",
        user_id="message-user",
        title=DEFAULT_SESSION_TITLE,
        system_title=DEFAULT_SESSION_TITLE,
    )
    db.add(session)
    db.flush()
    db.add(SessionEvent(
        id="msg-1",
        session_id=session.id,
        role="user",
        type="text",
        content="Help me compare abstraction and geometry",
        sequence_number=1,
    ))
    db.flush()

    refresh_session_title(db, session)

    assert session.system_title == "Help Compare Abstraction Geometry"
    assert session.title == "Help Compare Abstraction Geometry"
    assert session.title_state == SESSION_TITLE_STATE_AUTO


def test_get_or_create_owned_session_can_skip_generation_without_requested_id(db):
    _make_user(db, "skip-generate-user")

    session = get_or_create_owned_session(
        db,
        user_id="skip-generate-user",
        session_id=None,
        create_if_missing_id=False,
    )

    assert session is None


def test_attach_artwork_ids_to_session_dedupes_and_preserves_sequence(db):
    _make_user(db, "attach-user")
    session = SessionModel(id="sess-attach", user_id="attach-user", title=DEFAULT_SESSION_TITLE)
    artworks = [
        SavedArtwork(
            id="art-attach-1",
            user_id="attach-user",
            photo_uri="r2://attach-1",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            is_recognized=0,
        ),
        SavedArtwork(
            id="art-attach-2",
            user_id="attach-user",
            photo_uri="r2://attach-2",
            artist_name="Unknown Artist",
            artwork_name="Untitled",
            is_recognized=0,
        ),
    ]
    db.add(session)
    db.add_all(artworks)
    db.flush()
    db.add(SessionArtwork(session_id=session.id, artwork_id="art-attach-1", sequence_number=1, source="upload"))
    db.flush()

    inserted = attach_artwork_ids_to_session(
        db,
        session,
        ["art-attach-1", "art-attach-2", "art-attach-2"],
        source="library",
    )
    db.flush()

    assert inserted == 1
    links = (
        db.query(SessionArtwork)
        .filter(SessionArtwork.session_id == session.id)
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )
    assert [(link.artwork_id, link.sequence_number) for link in links] == [
        ("art-attach-1", 1),
        ("art-attach-2", 2),
    ]
    events = (
        db.query(ArtworkEvent)
        .filter(ArtworkEvent.artwork_id == "art-attach-2")
        .order_by(ArtworkEvent.created_at.asc())
        .all()
    )
    assert [event.event_type for event in events] == ["artwork_added_to_session"]
    assert events[0].trigger_session_id == session.id
