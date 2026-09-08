from datetime import timedelta

import pytest

from app.models.artwork import AIProvider
from app.database.models import SavedArtwork, Session as SessionModel, SessionArtwork, SessionEvent, User
from app.routers import session_chat as session_chat_router
from app.services.ai_client_interface import AIStreamChunk
from app.services.session_chat_service import (
    SessionChatItem,
    build_session_chat_items_payload,
    load_bootstrap_image_bytes,
    resolve_session_chat_request,
)
from app.utils.auth_utils import create_access_token


def _expected_item(item_id: str, keywords: list[str], *, with_metadata: bool = False) -> dict:
    """The full payload build_session_chat_items_payload sends to the AI."""
    return {
        "id": item_id,
        "keywords": keywords,
        "artist_name": "Test Artist" if with_metadata else None,
        "artwork_name": "Test Work" if with_metadata else None,
        "description": None,
        "date": None,
        "medium": None,
    }


def _chat_auth(db) -> tuple[dict[str, str], str]:
    user_id = "chat-test-user"
    if db.query(User).filter(User.user_id == user_id).first() is None:
        db.add(User(user_id=user_id, device_id=user_id))
        db.commit()
    return {"Authorization": f"Bearer {create_access_token({'sub': user_id})}"}, user_id


def _persist_chat_turn(db, user_id: str, message: str, *, with_history: bool = False) -> tuple[str, str]:
    session_id = "session-1"
    trigger_event_id = "trigger-1"
    db.add(SessionModel(id=session_id, user_id=user_id, title="Test Session"))
    artwork = SavedArtwork(
        id="a1",
        user_id=user_id,
        photo_uri="https://example.com/a.jpg",
        artist_name="Test Artist",
        artwork_name="Test Work",
    )
    db.add(artwork)
    db.add(SessionArtwork(id="link-1", session_id=session_id, artwork_id="a1", sequence_number=0))
    sequence_number = 1
    if with_history:
        db.add(SessionEvent(
            id="history-1",
            session_id=session_id,
            role="user",
            type="user_input",
            content="hello",
            sequence_number=sequence_number,
        ))
        sequence_number += 1
    db.add(SessionEvent(
        id=trigger_event_id,
        session_id=session_id,
        role="user",
        type="user_input",
        content=message,
        sequence_number=sequence_number,
    ))
    db.commit()
    return session_id, trigger_event_id


class _SessionAIService:
    async def session_chat(self, items, history, new_message, image_bytes_list, retrieval_context=""):
        assert items == [_expected_item("a1", [], with_metadata=True)]
        assert history == []
        assert new_message == "What do these have in common?"
        assert image_bytes_list == [b"image-a"]
        return "They share a rhythmic abstract language."

    async def stream_session_chat(self, items, history, new_message, image_bytes_list, retrieval_context=""):
        assert items == [_expected_item("a1", [], with_metadata=True)]
        assert history == [{"role": "user", "content": "hello"}]
        assert new_message == "Continue."
        assert image_bytes_list == []
        for chunk in ("Part one. ", "Part two."):
            yield chunk


class _SessionAIServiceWithUsage(_SessionAIService):
    async def stream_session_chat_result(self, items, history, new_message, image_bytes_list, retrieval_context=""):
        async for text in super().stream_session_chat(
            items,
            history,
            new_message,
            image_bytes_list,
            retrieval_context,
        ):
            yield AIStreamChunk(type="text", text=text)
        yield AIStreamChunk(type="usage", input_tokens=123, output_tokens=45)


@pytest.mark.asyncio
async def test_load_bootstrap_image_bytes_only_for_new_conversation(monkeypatch):
    calls: list[str] = []

    async def fake_image_loader(url: str):
        calls.append(url)
        return f"bytes:{url}".encode()

    monkeypatch.setattr("app.services.session_chat_service.image_url_to_bytes", fake_image_loader)

    items = [
        SessionChatItem(id="1", url="https://a.example/img1.jpg", keywords=["one"]),
        SessionChatItem(id="2", url="https://a.example/img2.jpg", keywords=["two"]),
    ]

    bootstrap = await load_bootstrap_image_bytes(items, [])
    assert bootstrap == [
        b"bytes:https://a.example/img1.jpg",
        b"bytes:https://a.example/img2.jpg",
    ]
    assert calls == ["https://a.example/img1.jpg", "https://a.example/img2.jpg"]

    calls.clear()
    bootstrap_with_history = await load_bootstrap_image_bytes(items, [{"role": "user", "content": "hi"}])
    assert bootstrap_with_history == []
    assert calls == []


def test_session_chat_route(client, monkeypatch, db):
    headers, user_id = _chat_auth(db)
    session_id, trigger_event_id = _persist_chat_turn(db, user_id, "What do these have in common?")
    monkeypatch.setattr(session_chat_router, "determine_ai_provider", lambda _model=None: AIProvider.OPENAI)
    monkeypatch.setattr(
        session_chat_router.AIServiceFactory,
        "get_service",
        lambda _provider: _SessionAIService(),
    )

    async def fake_bootstrap(items, history):
        assert len(items) == 1
        assert history == []
        return [b"image-a"]

    monkeypatch.setattr(session_chat_router, "load_bootstrap_image_bytes", fake_bootstrap)

    response = client.post(
        "/api/session/chat",
        headers=headers,
        json={
            "session_id": session_id,
            "trigger_event_id": trigger_event_id,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"response": "They share a rhythmic abstract language."}

def test_session_chat_stream_route(client, monkeypatch, db):
    headers, user_id = _chat_auth(db)
    session_id, trigger_event_id = _persist_chat_turn(db, user_id, "Continue.", with_history=True)
    monkeypatch.setattr(session_chat_router, "determine_ai_provider", lambda _model=None: AIProvider.OPENAI)
    monkeypatch.setattr(
        session_chat_router.AIServiceFactory,
        "get_service",
        lambda _provider: _SessionAIService(),
    )

    async def fake_bootstrap(_items, history):
        assert history == [{"role": "user", "content": "hello"}]
        return []

    monkeypatch.setattr(session_chat_router, "load_bootstrap_image_bytes", fake_bootstrap)

    response = client.post(
        "/api/session/chat-stream",
        headers=headers,
        json={
            "session_id": session_id,
            "trigger_event_id": trigger_event_id,
        },
    )

    assert response.status_code == 200
    assert "event: chunk" in response.text
    assert "Part one. " in response.text
    assert "Part two." in response.text
    assert 'event: complete' in response.text
    assert '"response": "Part one. Part two."' in response.text

def test_session_chat_stream_rejects_an_expired_presented_token(client):
    expired_token = create_access_token({"sub": "user-1"}, expires_delta=timedelta(minutes=-1))

    response = client.post(
        "/api/session/chat-stream",
        headers={"Authorization": f"Bearer {expired_token}"},
        json={
            "items": [],
            "conversation_history": [],
            "new_message": "Continue.",
            "user_id": "user-1",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["error_code"] == "token_expired"


def test_session_chat_stream_route_records_usage_tokens(client, monkeypatch, db):
    headers, user_id = _chat_auth(db)
    session_id, trigger_event_id = _persist_chat_turn(db, user_id, "Continue.", with_history=True)
    completed: dict[str, int | None] = {}

    monkeypatch.setattr(session_chat_router, "determine_ai_provider", lambda _model=None: AIProvider.OPENAI)
    monkeypatch.setattr(
        session_chat_router.AIServiceFactory,
        "get_service",
        lambda _provider: _SessionAIServiceWithUsage(),
    )
    monkeypatch.setattr(session_chat_router, "start_ai_usage", lambda **_kwargs: "usage-1")

    def fake_succeed(_usage_id, *, input_tokens=None, output_tokens=None):
        completed["input_tokens"] = input_tokens
        completed["output_tokens"] = output_tokens

    monkeypatch.setattr(session_chat_router, "succeed_ai_usage", fake_succeed)

    async def fake_bootstrap(_items, _history):
        return []

    monkeypatch.setattr(session_chat_router, "load_bootstrap_image_bytes", fake_bootstrap)

    response = client.post(
        "/api/session/chat-stream",
        headers=headers,
        json={
            "session_id": session_id,
            "trigger_event_id": trigger_event_id,
        },
    )

    assert response.status_code == 200
    assert "Part one. " in response.text
    assert "Part two." in response.text
    assert "usage" not in response.text
    assert completed == {"input_tokens": 123, "output_tokens": 45}


def test_build_session_chat_items_payload():
    payload = build_session_chat_items_payload(
        [
            SessionChatItem(id="1", url="u1", keywords=["a", "b"]),
            SessionChatItem(id="2", url="u2", keywords=["c"]),
        ]
    )
    assert payload == [
        _expected_item("1", ["a", "b"]),
        _expected_item("2", ["c"]),
    ]


def test_resolver_uses_persisted_event_and_prioritizes_current_artwork(db):
    _, user_id = _chat_auth(db)
    session = SessionModel(id="session-resolver", user_id=user_id, title="Resolver")
    older = SavedArtwork(
        id="older",
        user_id=user_id,
        photo_uri="https://example.com/older.jpg",
        artist_name="Older Artist",
        artwork_name="Older Work",
    )
    current = SavedArtwork(
        id="current",
        user_id=user_id,
        photo_uri="https://example.com/current.jpg",
        artist_name="Current Artist",
        artwork_name="Current Work",
    )
    db.add_all([session, older, current])
    db.add_all([
        SessionArtwork(id="older-link", session_id=session.id, artwork_id=older.id, sequence_number=0),
        SessionArtwork(id="current-link", session_id=session.id, artwork_id=current.id, sequence_number=1),
        SessionEvent(
            id="prior-user",
            session_id=session.id,
            role="user",
            type="user_input",
            content="Earlier question",
            sequence_number=1,
        ),
        SessionEvent(
            id="prior-model",
            session_id=session.id,
            role="model",
            type="model_response",
            content="Earlier answer",
            payload={
                "status": "completed",
                "retrieval": {"selected_source_ids": ["saved-artwork"]},
            },
            sequence_number=2,
        ),
        SessionEvent(
            id="current-turn",
            session_id=session.id,
            role="user",
            type="user_input",
            content=None,
            payload={"artworks": [{"artwork_id": current.id, "source": "upload"}]},
            sequence_number=3,
        ),
    ])
    db.commit()

    resolved = resolve_session_chat_request(db, session, "current-turn")

    assert [item.id for item in resolved.items] == ["current", "older"]
    assert resolved.conversation_history == [
        {"role": "user", "content": "Earlier question"},
        {
            "role": "assistant",
            "content": "Earlier answer",
            "retrieval_source_ids": ["saved-artwork"],
        },
    ]
    assert resolved.has_user_text is False
    assert resolved.new_message.startswith('The user added "Current Work" by Current Artist')


def test_resolver_reads_latest_saved_goal_without_changing_user_event(db):
    _, user_id = _chat_auth(db)
    session = SessionModel(id="goal-session", user_id=user_id, title="Goal",
                           metadata_json={"user_goal": "Study color"})
    event = SessionEvent(id="goal-turn", session_id=session.id, role="user", type="user_input",
                         content="What should I notice?", sequence_number=1)
    db.add_all([session, event])
    db.commit()
    assert "Study color" in resolve_session_chat_request(db, session, event.id).new_message
    session.metadata_json = {"user_goal": "Compare materials"}
    db.commit()
    resolved = resolve_session_chat_request(db, session, event.id)
    assert "Compare materials" in resolved.new_message
    assert "Study color" not in resolved.new_message
    assert event.content == "What should I notice?"
    session.metadata_json = {"user_goal": ""}
    db.commit()
    assert resolve_session_chat_request(db, session, event.id).new_message == event.content
