import pytest

from app.models.ai_job import AIJobType
from app.prompts.registry import (
    AestheticTermPromptContext,
    ArtworkAnalysisPromptContext,
    ArtworkFunFactsPromptContext,
    ArtworkIdentificationPromptContext,
    ArtworkSummaryPromptContext,
    PROMPT_REGISTRY,
    PromptDefinition,
    SessionChatPromptContext,
    SessionChatTurnContext,
    SuggestTopicsPromptContext,
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


@pytest.mark.parametrize(
    ("job_type", "context", "expected_values"),
    [
        (
            AIJobType.ARTWORK_IDENTIFICATION,
            ArtworkIdentificationPromptContext(
                artist_name="Hilma af Klint",
                artwork_name="The Swan",
                additional_clue="black and white circles",
                has_label_image=True,
            ),
            ["Hilma af Klint", "The Swan", "black and white circles", "museum/gallery label"],
        ),
        (
            AIJobType.ARTWORK_ANALYSIS,
            ArtworkAnalysisPromptContext(metadata={"artist": "Hilma af Klint", "title": "The Swan"}),
            ["Hilma af Klint", "The Swan", "unknown"],
        ),
        (
            AIJobType.ARTWORK_SUMMARY,
            ArtworkSummaryPromptContext(
                artist_name="Hilma af Klint",
                artwork_name="The Swan",
                conversation_history=[],
                language="es",
            ),
            ["Hilma af Klint", "The Swan", "Spanish"],
        ),
        (
            AIJobType.SUGGEST_TOPICS,
            SuggestTopicsPromptContext(
                artist_name="Hilma af Klint",
                artwork_name="The Swan",
                previous_insights=["Symbolic duality"],
            ),
            ["Hilma af Klint", "The Swan", "Symbolic duality"],
        ),
        (
            AIJobType.ARTWORK_FUN_FACTS,
            ArtworkFunFactsPromptContext(artist_name="Hilma af Klint", artwork_name="The Swan"),
            ["Hilma af Klint", "The Swan"],
        ),
        (
            AIJobType.AESTHETIC_TERM_DEFINITION,
            AestheticTermPromptContext(term="dreamlike"),
            ["dreamlike"],
        ),
    ],
)
def test_artwork_prompt_jobs_route_context_values(job_type, context, expected_values):
    prompt = render_prompt(job_type, context)

    for value in expected_values:
        assert value in prompt


def test_identification_and_reidentification_share_the_canonical_prompt_definition():
    assert PROMPT_REGISTRY[AIJobType.ARTWORK_IDENTIFICATION] == PROMPT_REGISTRY[
        AIJobType.ARTWORK_REIDENTIFICATION
    ]


@pytest.mark.parametrize("rendered", ["", "Prompt with {missing_value}"])
def test_registry_rejects_invalid_rendered_prompts(monkeypatch, rendered):
    monkeypatch.setitem(
        PROMPT_REGISTRY,
        AIJobType.AESTHETIC_TERM_DEFINITION,
        PromptDefinition(context_type=AestheticTermPromptContext, renderer=lambda _context: rendered),
    )

    with pytest.raises(ValueError):
        render_prompt(
            AIJobType.AESTHETIC_TERM_DEFINITION,
            AestheticTermPromptContext(term="dreamlike"),
        )


@pytest.mark.parametrize("text", ["What should I notice?", None])
def test_session_chat_goal_is_included_for_text_and_artwork_turns(text):
    rendered = render_prompt_turn(AIJobType.SESSION_CHAT, SessionChatTurnContext(
        user_text=text, artwork_labels=["Water Lilies"], artwork_sources=["library"],
        is_first_turn=False, user_goal="  Study color relationships  ",
    ))
    assert "Visitor's saved session goal: Study color relationships" in rendered
    assert (text or "Water Lilies") in rendered
