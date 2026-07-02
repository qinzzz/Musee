from types import SimpleNamespace

from app.services.claude_api_client import ClaudeAPIClient
from app.services.gemini_api_client import GeminiAPIClient
from app.services.openai_api_client import OpenAIAPIClient


def test_gemini_extracts_snake_case_usage_metadata():
    response = SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=678,
            candidates_token_count=81,
        )
    )

    assert GeminiAPIClient._extract_usage(response) == (678, 81)


def test_gemini_extracts_camel_case_usage_metadata_from_dict():
    response = {
        "usageMetadata": {
            "promptTokenCount": 678,
            "candidatesTokenCount": 81,
        }
    }

    assert GeminiAPIClient._extract_usage(response) == (678, 81)


def test_openai_extracts_chat_completion_usage():
    response = SimpleNamespace(
        usage=SimpleNamespace(
            prompt_tokens=100,
            completion_tokens=25,
        )
    )

    assert OpenAIAPIClient._extract_usage(response) == (100, 25)


def test_claude_extracts_message_usage():
    response = SimpleNamespace(
        usage=SimpleNamespace(
            input_tokens=100,
            output_tokens=25,
        )
    )

    assert ClaudeAPIClient._extract_usage(response) == (100, 25)
