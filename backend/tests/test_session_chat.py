from datetime import timedelta

import pytest

from app.models.artwork import AIProvider
from app.database.models import User
from app.routers import session_chat as session_chat_router
from app.services.ai_client_interface import AIStreamChunk
from app.services.session_chat_service import ExhibitionItem, build_session_chat_items_payload, load_bootstrap_image_bytes
from app.utils.auth_utils import create_access_token


def _expected_item(item_id: str, keywords: list[str]) -> dict:
    """The full payload build_session_chat_items_payload sends to the AI."""
    return {
        "id": item_id,
        "keywords": keywords,
        "artist_name": None,
        "artwork_name": None,
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


class _SessionAIService:
    async def session_chat(self, items, history, new_message, image_bytes_list):
        assert items == [_expected_item("a1", ["red", "abstract"])]
        assert history == []
        assert new_message == "What do these have in common?"
        assert image_bytes_list == [b"image-a"]
        return "They share a rhythmic abstract language."

    async def stream_session_chat(self, items, history, new_message, image_bytes_list):
        assert items == [_expected_item("a1", ["red", "abstract"])]
        assert history == [{"role": "user", "content": "hello"}]
        assert new_message == "Continue."
        assert image_bytes_list == []
        for chunk in ("Part one. ", "Part two."):
            yield chunk


class _SessionAIServiceWithUsage(_SessionAIService):
    async def stream_session_chat_result(self, items, history, new_message, image_bytes_list):
        async for text in super().stream_session_chat(items, history, new_message, image_bytes_list):
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
        ExhibitionItem(id="1", url="https://a.example/img1.jpg", keywords=["one"]),
        ExhibitionItem(id="2", url="https://a.example/img2.jpg", keywords=["two"]),
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
            "items": [
                {
                    "id": "a1",
                    "url": "https://example.com/a.jpg",
                    "keywords": ["red", "abstract"],
                }
            ],
            "conversation_history": [],
            "new_message": "What do these have in common?",
            "user_id": user_id,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"response": "They share a rhythmic abstract language."}

    legacy_response = client.post(
        "/api/visit/chat",
        headers=headers,
        json={
            "items": [
                {
                    "id": "a1",
                    "url": "https://example.com/a.jpg",
                    "keywords": ["red", "abstract"],
                }
            ],
            "conversation_history": [],
            "new_message": "What do these have in common?",
            "user_id": user_id,
        },
    )
    assert legacy_response.status_code == 200


def test_session_chat_stream_route(client, monkeypatch, db):
    headers, user_id = _chat_auth(db)
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
            "items": [
                {
                    "id": "a1",
                    "url": "https://example.com/a.jpg",
                    "keywords": ["red", "abstract"],
                }
            ],
            "conversation_history": [{"role": "user", "content": "hello"}],
            "new_message": "Continue.",
            "user_id": user_id,
        },
    )

    assert response.status_code == 200
    assert "event: chunk" in response.text
    assert "Part one. " in response.text
    assert "Part two." in response.text
    assert 'event: complete' in response.text
    assert '"response": "Part one. Part two."' in response.text

    legacy_response = client.post(
        "/api/visit/chat-stream",
        headers=headers,
        json={
            "items": [
                {
                    "id": "a1",
                    "url": "https://example.com/a.jpg",
                    "keywords": ["red", "abstract"],
                }
            ],
            "conversation_history": [{"role": "user", "content": "hello"}],
            "new_message": "Continue.",
            "user_id": user_id,
        },
    )
    assert legacy_response.status_code == 200


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
            "items": [{"id": "a1", "url": "https://example.com/a.jpg", "keywords": ["red", "abstract"]}],
            "conversation_history": [{"role": "user", "content": "hello"}],
            "new_message": "Continue.",
            "user_id": user_id,
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
            ExhibitionItem(id="1", url="u1", keywords=["a", "b"]),
            ExhibitionItem(id="2", url="u2", keywords=["c"]),
        ]
    )
    assert payload == [
        _expected_item("1", ["a", "b"]),
        _expected_item("2", ["c"]),
    ]
