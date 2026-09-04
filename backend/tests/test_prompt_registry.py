import pytest

from app.models.ai_job import AIJobType
from app.prompts.registry import (
    SessionChatPromptContext,
    SessionChatTurnContext,
    render_prompt,
    render_prompt_turn,
)


def test_session_chat_prompt_is_registered_by_existing_job_type():
    prompt = render_prompt(
        AIJobType.SESSION_CHAT,
        SessionChatPromptContext(items=[{
            "artwork_name": "The Swan",
            "artist_name": "Hilma af Klint",
            "keywords": ["symbolism"],
        }]),
    )

    assert "art-loving companion" in prompt
    assert "The Swan | by Hilma af Klint" in prompt


def test_registry_rejects_the_wrong_context_type():
    with pytest.raises(TypeError, match="SessionChatPromptContext"):
        render_prompt(AIJobType.SESSION_CHAT, object())


def test_session_turn_preserves_authored_text_without_fallback_prose():
    message = render_prompt_turn(
        AIJobType.SESSION_CHAT,
        SessionChatTurnContext(
            user_text="What should I notice?",
            artwork_labels=['"The Swan" by Hilma af Klint'],
            artwork_sources=["upload"],
            is_first_turn=True,
        ),
    )

    assert message == "What should I notice?"


def test_session_turn_describes_artwork_only_event_without_impersonating_user():
    message = render_prompt_turn(
        AIJobType.SESSION_CHAT,
        SessionChatTurnContext(
            user_text=None,
            artwork_labels=['"The Swan" by Hilma af Klint'],
            artwork_sources=["upload"],
            is_first_turn=False,
        ),
    )

    assert message.startswith('The user added "The Swan" by Hilma af Klint from upload.')
    assert "did not include a written question" in message
    assert "I just added" not in message
