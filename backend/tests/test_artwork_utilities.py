import io

from app.models.artwork import AIProvider


def test_suggest_topic_returns_default_for_invalid_history(client):
    response = client.post(
        "/api/suggest-topic",
        data={
            "artist_name": "Hilma af Klint",
            "artwork_name": "The Swan",
            "conversation_history": "{not-json",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "suggested_topics": ["default topic"],
        "error": "Invalid conversation history",
    }


def test_get_available_providers_returns_payload(client, monkeypatch):
    monkeypatch.setattr(
        "app.services.artwork_utilities_service.AIServiceFactory.get_available_providers",
        lambda: [AIProvider.OPENAI, AIProvider.GEMINI],
    )

    response = client.get("/api/providers")

    assert response.status_code == 200
    body = response.json()
    assert body["available_providers"] == ["openai", "gemini"]
    assert body["total"] == 2


def test_remove_background_returns_png_response(client, monkeypatch):
    async def fake_remove_background(_image_data: bytes):
        return b"png-bytes"

    monkeypatch.setattr(
        "app.services.artwork_utilities_service.photoroom_service.remove_background",
        fake_remove_background,
    )

    response = client.post(
        "/api/remove-background",
        files={"image": ("art.jpg", io.BytesIO(b"stub"), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.content == b"png-bytes"
    assert response.headers["content-type"] == "image/png"


def test_artwork_insights_short_circuits_unknown_artist(client):
    response = client.post(
        "/api/artwork-insights",
        json={
            "artist_name": "Unknown Artist",
            "artwork_name": "Untitled",
            "language": "en",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"points": []}
