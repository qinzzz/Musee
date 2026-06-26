import pytest

from app.models.artwork import AIProvider
from app.routers import session_chat as session_chat_router
from app.services.session_chat_service import ExhibitionItem, build_session_chat_items_payload, load_bootstrap_image_bytes


class _SessionAIService:
    async def session_chat(self, items, history, new_message, image_bytes_list):
        assert items == [{"keywords": ["red", "abstract"]}]
        assert history == []
        assert new_message == "What do these have in common?"
        assert image_bytes_list == [b"image-a"]
        return "They share a rhythmic abstract language."

    async def stream_session_chat(self, items, history, new_message, image_bytes_list):
        assert items == [{"keywords": ["red", "abstract"]}]
        assert history == [{"role": "user", "content": "hello"}]
        assert new_message == "Continue."
        assert image_bytes_list == []
        for chunk in ("Part one. ", "Part two."):
            yield chunk


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


def test_session_chat_route(client, monkeypatch):
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
        },
    )

    assert response.status_code == 200
    assert response.json() == {"response": "They share a rhythmic abstract language."}

    legacy_response = client.post(
        "/api/visit/chat",
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
        },
    )
    assert legacy_response.status_code == 200


def test_session_chat_stream_route(client, monkeypatch):
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
        },
    )
    assert legacy_response.status_code == 200


def test_build_session_chat_items_payload():
    payload = build_session_chat_items_payload(
        [
            ExhibitionItem(id="1", url="u1", keywords=["a", "b"]),
            ExhibitionItem(id="2", url="u2", keywords=["c"]),
        ]
    )
    assert payload == [
        {"keywords": ["a", "b"]},
        {"keywords": ["c"]},
    ]
