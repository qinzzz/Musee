from fastapi.testclient import TestClient

from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionMessage, User
from app.main import app
from app.routers import sessions as sessions_router
from app.utils.auth_utils import create_access_token
from tests.conftest import TestingSessionLocal


def _auth_headers(user_id: str) -> dict[str, str]:
    token = create_access_token({"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


def test_list_sessions_returns_user_sessions(client, db):
    db.add(User(user_id="sess-user", device_id="sess-user"))
    db.add(SessionModel(id="sess-1", user_id="sess-user", title="One"))
    db.add(SessionModel(id="sess-2", user_id="sess-user", title="Two"))
    db.commit()

    response = client.get("/api/sessions", params={"user_id": "sess-user"})

    assert response.status_code == 200
    assert {session["id"] for session in response.json()} == {"sess-1", "sess-2"}


def test_get_session_messages_rejects_authenticated_non_owner(client, db):
    db.add(User(user_id="owner", device_id="owner"))
    db.add(User(user_id="other", device_id="other"))
    db.add(SessionModel(id="visit-1", user_id="owner", title="Owner session"))
    db.add(SessionMessage(id="msg-1", session_id="visit-1", role="user", type="text", content="hello", sequence_number=1))
    db.commit()

    response = client.get("/api/sessions/visit-1/messages", headers=_auth_headers("other"))

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to access this session"


def test_append_session_messages_rejects_authenticated_non_owner(client, db):
    db.add(User(user_id="owner-2", device_id="owner-2"))
    db.add(User(user_id="other-2", device_id="other-2"))
    db.add(SessionModel(id="visit-2", user_id="owner-2", title="Owner session"))
    db.commit()

    response = client.post(
        "/api/sessions/visit-2/messages",
        headers=_auth_headers("other-2"),
        json=[{"role": "user", "type": "text", "content": "test"}],
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Not authorized to access this session"


def test_start_session_with_message_creates_session_and_first_message(client, db):
    response = client.post(
        "/api/sessions/start-with-message",
        params={"user_id": "fresh-user"},
        json={
            "session_id": "visit-new",
            "title": "Untitled Session",
            "message": {
                "id": "msg-1",
                "role": "user",
                "type": "text",
                "content": "Help me understand this work",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["inserted"] == 1
    assert payload["session"]["id"] == "visit-new"

    session_record = db.query(SessionModel).filter(SessionModel.id == "visit-new").first()
    assert session_record is not None
    assert session_record.user_id == "fresh-user"

    messages = db.query(SessionMessage).filter(SessionMessage.session_id == "visit-new").all()
    assert len(messages) == 1
    assert messages[0].content == "Help me understand this work"


def test_start_session_with_artworks_creates_session_and_attaches_links(client, db):
    db.add(User(user_id="art-user", device_id="art-user"))
    db.add(SavedArtwork(id="art-1", user_id="art-user", photo_uri="https://example.com/1.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SavedArtwork(id="art-2", user_id="art-user", photo_uri="https://example.com/2.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.commit()

    response = client.post(
        "/api/sessions/start-with-artworks",
        params={"user_id": "art-user"},
        json={
            "session_id": "visit-art",
            "title": "Untitled Session",
            "artwork_ids": ["art-1", "art-2"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["inserted"] == 2
    assert payload["session"]["id"] == "visit-art"

    session_record = db.query(SessionModel).filter(SessionModel.id == "visit-art").first()
    assert session_record is not None

    links = (
        db.query(SessionArtwork)
        .filter(SessionArtwork.session_id == "visit-art")
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )
    assert [link.artwork_id for link in links] == ["art-1", "art-2"]


def test_start_session_with_message_does_not_leave_shell_session_on_failure(monkeypatch):
    def failing_append_messages(*_args, **_kwargs):
        raise RuntimeError("write failed")

    monkeypatch.setattr(sessions_router, "append_messages_to_session", failing_append_messages)

    with TestClient(app, raise_server_exceptions=False) as failing_client:
        response = failing_client.post(
            "/api/sessions/start-with-message",
            params={"user_id": "failed-user"},
            json={
                "session_id": "visit-failed",
                "title": "Untitled Session",
                "message": {
                    "role": "user",
                    "type": "text",
                    "content": "Hello",
                },
            },
        )

    assert response.status_code == 500

    with TestingSessionLocal() as db:
        assert db.query(SessionModel).filter(SessionModel.id == "visit-failed").first() is None


def test_start_session_with_artworks_does_not_leave_shell_session_on_failure(monkeypatch, db):
    db.add(User(user_id="art-fail-user", device_id="art-fail-user"))
    db.add(SavedArtwork(id="art-fail-1", user_id="art-fail-user", photo_uri="https://example.com/1.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.commit()

    def failing_link(*_args, **_kwargs):
        raise RuntimeError("link failed")

    monkeypatch.setattr(sessions_router, "ensure_session_artwork_link", failing_link)

    with TestClient(app, raise_server_exceptions=False) as failing_client:
        response = failing_client.post(
            "/api/sessions/start-with-artworks",
            params={"user_id": "art-fail-user"},
            json={
                "session_id": "visit-art-failed",
                "title": "Untitled Session",
                "artwork_ids": ["art-fail-1"],
            },
        )

    assert response.status_code == 500

    with TestingSessionLocal() as db:
        assert db.query(SessionModel).filter(SessionModel.id == "visit-art-failed").first() is None


def test_delete_session_removes_messages_and_links_but_keeps_artworks(client, db):
    db.add(User(user_id="delete-user", device_id="delete-user"))
    db.add(SessionModel(id="delete-session", user_id="delete-user", title="Session"))
    db.add(SavedArtwork(id="delete-art", user_id="delete-user", photo_uri="https://example.com/delete.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SessionArtwork(session_id="delete-session", artwork_id="delete-art", sequence_number=1, source="upload"))
    db.add(SessionMessage(id="delete-msg", session_id="delete-session", role="user", type="text", content="hello", sequence_number=1))
    db.commit()

    response = client.delete("/api/sessions/delete-session", params={"user_id": "delete-user"})

    assert response.status_code == 200

    assert db.query(SessionModel).filter(SessionModel.id == "delete-session").first() is None
    assert db.query(SessionArtwork).filter(SessionArtwork.session_id == "delete-session").count() == 0
    assert db.query(SessionMessage).filter(SessionMessage.session_id == "delete-session").count() == 0
    assert db.query(SavedArtwork).filter(SavedArtwork.id == "delete-art").first() is not None
