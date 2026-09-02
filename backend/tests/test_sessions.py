from datetime import UTC, datetime

import pytest
from fastapi import Depends, Request
from fastapi.testclient import TestClient
from jose import jwt

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionEvent, User
from app.main import app
from app.routers import sessions as sessions_router
from app.services.authorization_service import RequestPrincipal, get_request_principal
from app.utils.auth_utils import create_access_token
from tests.conftest import TestingSessionLocal


def _auth_headers(user_id: str) -> dict[str, str]:
    token = create_access_token({"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def authenticated_session_route_context():
    """Keep domain-route tests authenticated; guest policy has focused tests."""
    async def _resolve_test_principal(request: Request, db=Depends(get_db)):
        user_id = request.query_params.get("user_id")
        authorization = request.headers.get("authorization", "")
        if authorization.startswith("Bearer "):
            claims = jwt.decode(
                authorization.removeprefix("Bearer "),
                settings.secret_key,
                algorithms=[settings.algorithm],
            )
            user_id = claims["sub"]
        if not user_id:
            session_id = request.path_params.get("session_id")
            session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            user_id = session_record.user_id if session_record else "session-route-test-user"
        user = db.query(User).filter(User.user_id == user_id).first()
        if user is None:
            user = User(user_id=user_id, device_id=user_id)
            db.add(user)
            db.commit()
            db.refresh(user)
        return RequestPrincipal(state="authenticated", user_id=user.user_id, user=user)

    app.dependency_overrides[get_request_principal] = _resolve_test_principal
    yield
    app.dependency_overrides.pop(get_request_principal, None)


def test_list_sessions_returns_user_sessions(client, db):
    db.add(User(user_id="sess-user", device_id="sess-user"))
    db.add(SessionModel(id="sess-1", user_id="sess-user", title="One"))
    db.add(SessionModel(id="sess-2", user_id="sess-user", title="Two"))
    db.commit()

    response = client.get("/api/sessions", params={"user_id": "sess-user"})

    assert response.status_code == 200
    assert {session["id"] for session in response.json()} == {"sess-1", "sess-2"}


def test_create_session_is_idempotent_for_a_client_generated_id(client, db):
    first_response = client.post(
        "/api/sessions",
        params={"user_id": "session-first-user"},
        json={"session_id": "client-session-1", "title": "First question"},
    )
    second_response = client.post(
        "/api/sessions",
        params={"user_id": "session-first-user"},
        json={"session_id": "client-session-1", "title": "A later retry"},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json()["session"]["id"] == "client-session-1"
    assert second_response.json()["session"]["id"] == "client-session-1"
    assert second_response.json()["session"]["title"] == "First question"

    sessions = db.query(SessionModel).filter(SessionModel.id == "client-session-1").all()
    assert len(sessions) == 1
    assert sessions[0].user_id == "session-first-user"
    assert sessions[0].title == "First question"


def test_get_session_messages_rejects_authenticated_non_owner(client, db):
    db.add(User(user_id="owner", device_id="owner"))
    db.add(User(user_id="other", device_id="other"))
    db.add(SessionModel(id="visit-1", user_id="owner", title="Owner session"))
    db.add(SessionEvent(id="msg-1", session_id="visit-1", role="user", type="text", content="hello", sequence_number=1))
    db.commit()

    response = client.get("/api/sessions/visit-1/events", headers=_auth_headers("other"))

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "principal_mismatch"


def test_session_events_include_deleted_artwork_display_metadata(client, db):
    db.add(User(user_id="deleted-history-user", device_id="deleted-history-user"))
    db.add(SessionModel(id="deleted-history-session", user_id="deleted-history-user", title="History"))
    db.add(
        SavedArtwork(
            id="deleted-history-artwork",
            user_id="deleted-history-user",
            photo_uri="r2://deleted-history",
            artist_name="Georgia O'Keeffe",
            artwork_name="Blue and Green Music",
            params={"date": "1919–1921"},
            deleted_at=datetime.now(UTC),
        )
    )
    db.add(
        SessionEvent(
            id="deleted-history-event",
            session_id="deleted-history-session",
            role="user",
            type="user_input",
            payload={"artworks": [{"artwork_id": "deleted-history-artwork", "source": "upload"}]},
            sequence_number=1,
        )
    )
    db.commit()

    response = client.get("/api/sessions/deleted-history-session/events")

    assert response.status_code == 200
    deleted_reference = response.json()[0]["payload"]["deleted_artworks"][0]
    assert deleted_reference == {
        "artwork_id": "deleted-history-artwork",
        "artwork_name": "Blue and Green Music",
        "artist_name": "Georgia O'Keeffe",
        "date": "1919–1921",
        "deleted_at": deleted_reference["deleted_at"],
    }
    assert deleted_reference["deleted_at"]


def test_append_session_messages_rejects_authenticated_non_owner(client, db):
    db.add(User(user_id="owner-2", device_id="owner-2"))
    db.add(User(user_id="other-2", device_id="other-2"))
    db.add(SessionModel(id="visit-2", user_id="owner-2", title="Owner session"))
    db.commit()

    response = client.post(
        "/api/sessions/visit-2/events",
        headers=_auth_headers("other-2"),
        json=[{"role": "user", "type": "text", "content": "test"}],
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "principal_mismatch"


def test_start_session_with_message_creates_session_and_first_message(client, db):
    response = client.post(
        "/api/sessions/start-with-event",
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

    messages = db.query(SessionEvent).filter(SessionEvent.session_id == "visit-new").all()
    assert len(messages) == 1
    assert messages[0].type == "user_input"
    assert messages[0].content == "Help me understand this work"


def test_start_session_with_message_accepts_canonical_user_input_event_type(client, db):
    response = client.post(
        "/api/sessions/start-with-event",
        params={"user_id": "canonical-user"},
        json={
            "session_id": "visit-canonical",
            "title": "Untitled Session",
            "message": {
                "id": "msg-canonical",
                "role": "user",
                "event_type": "user_input",
                "content": "Start with the story here",
            },
        },
    )

    assert response.status_code == 200

    message = db.query(SessionEvent).filter(SessionEvent.session_id == "visit-canonical").one()
    assert message.type == "user_input"
    assert message.trigger_event_id is None
    assert message.payload is None


def test_start_session_with_message_rejects_trigger_on_user_input(client, db):
    response = client.post(
        "/api/sessions/start-with-event",
        params={"user_id": "canonical-user"},
        json={
            "session_id": "visit-canonical-invalid",
            "title": "Untitled Session",
            "message": {
                "id": "msg-canonical-invalid",
                "role": "user",
                "event_type": "user_input",
                "content": "Start with the story here",
                "trigger_event_id": "evt-parent-1",
            },
        },
    )

    assert response.status_code == 400
    assert "cannot set trigger_event_id" in response.json()["detail"]


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

    monkeypatch.setattr(sessions_router, "append_events_to_session", failing_append_messages)

    with TestClient(app, raise_server_exceptions=False) as failing_client:
        response = failing_client.post(
            "/api/sessions/start-with-event",
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


def test_append_session_messages_accepts_event_fields_and_keeps_legacy_response_shape(client, db):
    db.add(User(user_id="event-user", device_id="event-user"))
    db.add(SessionModel(id="visit-event", user_id="event-user", title="Event session"))
    db.commit()

    response = client.post(
        "/api/sessions/visit-event/events",
        json=[{
            "id": "event-msg-1",
            "role": "user",
            "event_type": "artwork_input",
            "artwork_ids": ["artwork-123"],
            "payload": {"source": "capture", "has_label": True},
        }],
    )

    assert response.status_code == 200
    db.expire_all()
    stored = db.query(SessionEvent).filter(SessionEvent.id == "event-msg-1").one()
    assert stored.type == "user_input"
    assert stored.trigger_event_id is None
    assert stored.payload == {
        "artworks": [
            {"artwork_id": "artwork-123", "source": "capture", "reference": {"has_label": True}}
        ]
    }

    fetch_response = client.get("/api/sessions/visit-event/events")
    assert fetch_response.status_code == 200
    payload = fetch_response.json()
    assert payload == [{
        "id": "event-msg-1",
        "session_id": "visit-event",
        "role": "user",
        "type": "artwork_capture",
        "event_type": "user_input",
        "content": None,
        "artwork_id": "artwork-123",
        "artwork_ids": ["artwork-123"],
        "trigger_event_id": None,
        "payload": {"artworks": [{"artwork_id": "artwork-123", "source": "capture", "reference": {"has_label": True}}]},
        "sequence_number": 1,
        "created_at": payload[0]["created_at"],
    }]


def test_get_session_messages_normalizes_legacy_types(client, db):
    db.add(User(user_id="legacy-user", device_id="legacy-user"))
    db.add(SessionModel(id="visit-legacy", user_id="legacy-user", title="Legacy session"))
    db.add(SessionEvent(
        id="legacy-art-card",
        session_id="visit-legacy",
        role="model",
        type="artwork_card",
        payload={"artwork_ids": ["legacy-artwork"], "result_kind": "identification"},
        sequence_number=1,
    ))
    db.commit()

    response = client.get("/api/sessions/visit-legacy/events")

    assert response.status_code == 200
    assert response.json() == [{
        "id": "legacy-art-card",
        "session_id": "visit-legacy",
        "role": "model",
        "type": "artwork_card",
        "event_type": "artwork_result",
        "content": None,
        "artwork_id": "legacy-artwork",
        "artwork_ids": ["legacy-artwork"],
        "trigger_event_id": None,
        "payload": {"artwork_ids": ["legacy-artwork"], "result_kind": "identification"},
        "sequence_number": 1,
        "created_at": response.json()[0]["created_at"],
    }]


def test_append_session_messages_supports_multiple_artwork_ids(client, db):
    db.add(User(user_id="multi-art-user", device_id="multi-art-user"))
    db.add(SessionModel(id="visit-multi-art", user_id="multi-art-user", title="Multi artwork session"))
    db.add(SavedArtwork(id="artwork-a", user_id="multi-art-user", photo_uri="https://example.com/a.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SavedArtwork(id="artwork-b", user_id="multi-art-user", photo_uri="https://example.com/b.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.commit()

    response = client.post(
        "/api/sessions/visit-multi-art/events",
        json=[{
            "id": "event-msg-multi",
            "role": "model",
            "event_type": "artwork_result",
            "artwork_ids": ["artwork-a", "artwork-b"],
            "payload": {"result_kind": "commentary"},
        }],
    )

    assert response.status_code == 200

    stored = db.query(SessionEvent).filter(SessionEvent.id == "event-msg-multi").one()
    assert stored.payload == {
        "result_kind": "commentary",
        "artwork_ids": ["artwork-a", "artwork-b"],
    }

    fetch_response = client.get("/api/sessions/visit-multi-art/events")
    assert fetch_response.status_code == 200
    assert fetch_response.json() == [{
        "id": "event-msg-multi",
        "session_id": "visit-multi-art",
        "role": "model",
        "type": "artwork_card",
        "event_type": "artwork_result",
        "content": None,
        "artwork_id": "artwork-a",
        "artwork_ids": ["artwork-a", "artwork-b"],
        "trigger_event_id": None,
        "payload": {"result_kind": "commentary", "artwork_ids": ["artwork-a", "artwork-b"]},
        "sequence_number": 1,
        "created_at": fetch_response.json()[0]["created_at"],
    }]


def test_start_session_with_artworks_does_not_leave_shell_session_on_failure(monkeypatch, db):
    db.add(User(user_id="art-fail-user", device_id="art-fail-user"))
    db.add(SavedArtwork(id="art-fail-1", user_id="art-fail-user", photo_uri="https://example.com/1.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.commit()

    def failing_attach(*_args, **_kwargs):
        raise RuntimeError("link failed")

    monkeypatch.setattr(sessions_router, "attach_artwork_ids_to_session", failing_attach)

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


def test_patch_session_message_updates_legacy_commentary_to_model_response(client, db):
    db.add(User(user_id="commentary-user", device_id="commentary-user"))
    db.add(SessionModel(id="visit-commentary", user_id="commentary-user", title="Commentary session"))
    db.add(SavedArtwork(id="artwork-commentary", user_id="commentary-user", photo_uri="https://example.com/c.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SessionEvent(
        id="msg-commentary",
        session_id="visit-commentary",
        role="model",
        type="artwork_commentary",
        content=None,
        payload={"status": "pending", "artwork_ids": ["artwork-commentary"]},
        sequence_number=1,
    ))
    db.commit()

    response = client.patch(
        "/api/sessions/visit-commentary/events/msg-commentary",
        json={
            "role": "model",
            "event_type": "model_response",
            "content": "Here is the finished commentary.",
            "artwork_ids": ["artwork-commentary"],
            "payload": {"status": "completed"},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["event_type"] == "model_response"
    assert payload["content"] == "Here is the finished commentary."
    assert payload["payload"] == {
        "status": "completed",
        "artwork_ids": ["artwork-commentary"],
    }
    assert payload["artwork_ids"] == ["artwork-commentary"]

    db.expire_all()
    stored = db.query(SessionEvent).filter(SessionEvent.id == "msg-commentary").one()
    assert stored.type == "model_response"
    assert stored.content == "Here is the finished commentary."
    assert stored.payload == {
        "status": "completed",
        "artwork_ids": ["artwork-commentary"],
    }


def test_patch_session_message_updates_commentary_to_failed(client, db):
    db.add(User(user_id="commentary-failed-user", device_id="commentary-failed-user"))
    db.add(SessionModel(id="visit-commentary-failed", user_id="commentary-failed-user", title="Commentary session"))
    db.add(SavedArtwork(id="artwork-failed-a", user_id="commentary-failed-user", photo_uri="https://example.com/a.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SavedArtwork(id="artwork-failed-b", user_id="commentary-failed-user", photo_uri="https://example.com/b.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SessionEvent(
        id="msg-commentary-failed",
        session_id="visit-commentary-failed",
        role="model",
        type="artwork_commentary",
        content=None,
        payload={"status": "pending", "artwork_ids": ["artwork-failed-a"]},
        sequence_number=1,
    ))
    db.commit()

    response = client.patch(
        "/api/sessions/visit-commentary-failed/events/msg-commentary-failed",
        json={
            "role": "model",
            "event_type": "model_response",
            "artwork_ids": ["artwork-failed-a", "artwork-failed-b"],
            "payload": {
                "status": "failed",
                "error_message": "stream interrupted",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["content"] is None
    assert payload["payload"] == {
        "status": "failed",
        "error_message": "stream interrupted",
        "artwork_ids": ["artwork-failed-a", "artwork-failed-b"],
    }
    assert payload["artwork_ids"] == ["artwork-failed-a", "artwork-failed-b"]

    db.expire_all()
    stored = db.query(SessionEvent).filter(SessionEvent.id == "msg-commentary-failed").one()
    assert stored.payload == {
        "status": "failed",
        "error_message": "stream interrupted",
        "artwork_ids": ["artwork-failed-a", "artwork-failed-b"],
    }


def test_model_response_lifecycle_supports_text_only_sessions(client, db):
    db.add(User(user_id="text-response-user", device_id="text-response-user"))
    db.add(SessionModel(id="visit-text-response", user_id="text-response-user", title="Text session"))
    db.commit()

    created = client.post(
        "/api/sessions/visit-text-response/events",
        json=[{
            "id": "response-text-only",
            "role": "model",
            "event_type": "model_response",
            "trigger_event_id": "user-question",
            "payload": {"status": "pending"},
        }],
    )
    assert created.status_code == 200

    completed = client.patch(
        "/api/sessions/visit-text-response/events/response-text-only",
        json={
            "role": "model",
            "event_type": "model_response",
            "content": "A complete text-only answer.",
            "trigger_event_id": "user-question",
            "payload": {"status": "completed"},
        },
    )

    assert completed.status_code == 200
    payload = completed.json()
    assert payload["event_type"] == "model_response"
    assert payload["artwork_ids"] == []
    assert payload["content"] == "A complete text-only answer."
    assert payload["payload"] == {"status": "completed"}


def test_canonical_artwork_input_batch_persists_payload_links_and_legacy_shape(client, db):
    """An upload batch is one user_input event whose artworks live in
    payload.artworks (with source). Observe the DB to confirm it actually
    persists and reads back as the legacy artwork_capture transport type the FE
    reconstructs rows from."""
    db.add(User(user_id="batch-user", device_id="batch-user"))
    db.add(SessionModel(id="visit-batch", user_id="batch-user", title="Batch session"))
    db.add(SavedArtwork(id="batch-art-1", user_id="batch-user", photo_uri="https://example.com/1.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SavedArtwork(id="batch-art-2", user_id="batch-user", photo_uri="https://example.com/2.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.commit()

    response = client.post(
        "/api/sessions/visit-batch/events",
        json=[{
            "id": "input-batch-1",
            "role": "user",
            "event_type": "user_input",
            "artwork_ids": ["batch-art-1", "batch-art-2"],
            "payload": {"artworks": [
                {"artwork_id": "batch-art-1", "source": "upload"},
                {"artwork_id": "batch-art-2", "source": "capture"},
            ]},
        }],
    )

    assert response.status_code == 200
    db.expire_all()

    stored = db.query(SessionEvent).filter(SessionEvent.id == "input-batch-1").one()
    assert stored.type == "user_input"
    assert stored.trigger_event_id is None
    assert stored.payload == {"artworks": [
        {"artwork_id": "batch-art-1", "source": "upload"},
        {"artwork_id": "batch-art-2", "source": "capture"},
    ]}

    fetched = client.get("/api/sessions/visit-batch/events").json()
    assert len(fetched) == 1
    assert fetched[0]["type"] == "artwork_capture"
    assert fetched[0]["event_type"] == "user_input"
    assert fetched[0]["artwork_ids"] == ["batch-art-1", "batch-art-2"]
    assert fetched[0]["trigger_event_id"] is None


def test_legacy_artwork_capture_without_source_is_rejected(client, db):
    """Regression guard: the old upload path sent artwork_capture + artwork_id
    with no payload.artworks/source — which the backend rejects, silently
    dropping uploads. Document that this 400s and writes nothing."""
    db.add(User(user_id="legacy-cap-user", device_id="legacy-cap-user"))
    db.add(SessionModel(id="visit-legacy-cap", user_id="legacy-cap-user", title="Legacy capture"))
    db.add(SavedArtwork(id="legacy-cap-art", user_id="legacy-cap-user", photo_uri="https://example.com/x.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.commit()

    response = client.post(
        "/api/sessions/visit-legacy-cap/events",
        json=[{
            "id": "legacy-cap-1",
            "role": "user",
            "type": "artwork_capture",
            "artwork_id": "legacy-cap-art",
        }],
    )

    assert response.status_code == 400
    assert db.query(SessionEvent).filter(SessionEvent.id == "legacy-cap-1").first() is None


def test_delete_session_removes_messages_and_links_but_keeps_artworks(client, db):
    db.add(User(user_id="delete-user", device_id="delete-user"))
    db.add(SessionModel(id="delete-session", user_id="delete-user", title="Session"))
    db.add(SavedArtwork(id="delete-art", user_id="delete-user", photo_uri="https://example.com/delete.jpg", artist_name="Unknown Artist", artwork_name="Untitled"))
    db.add(SessionArtwork(session_id="delete-session", artwork_id="delete-art", sequence_number=1, source="upload"))
    db.add(SessionEvent(id="delete-msg", session_id="delete-session", role="user", type="text", content="hello", sequence_number=1))
    db.commit()

    response = client.delete("/api/sessions/delete-session", params={"user_id": "delete-user"})

    assert response.status_code == 200

    assert db.query(SessionModel).filter(SessionModel.id == "delete-session").first() is None
    assert db.query(SessionArtwork).filter(SessionArtwork.session_id == "delete-session").count() == 0
    assert db.query(SessionEvent).filter(SessionEvent.session_id == "delete-session").count() == 0
    assert db.query(SavedArtwork).filter(SavedArtwork.id == "delete-art").first() is not None
