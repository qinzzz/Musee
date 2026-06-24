from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionMessage, User
from app.services.session_service import (
    DEFAULT_SESSION_TITLE,
    SESSION_TITLE_STATE_AUTO,
    SESSION_TITLE_STATE_USER_LOCKED,
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
    db.add(SessionMessage(
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
