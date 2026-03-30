"""
Claude API Client - Handles only the actual API calls to Anthropic's Claude.
All business logic, prompt loading, and request construction is handled by AIService.
"""

import base64
from typing import Optional, Any, AsyncGenerator, Dict, List
from anthropic import AsyncAnthropic
from app.services.ai_client_interface import AIClientInterface
from app.models.artwork import AIProvider
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Default model
DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514"


class ClaudeAPIClient(AIClientInterface):
    """Claude-specific API client - only handles API calls"""

    def __init__(self):
        if not settings.claude_api_key:
            raise ValueError("Claude API key not configured")
        self.client = AsyncAnthropic(api_key=settings.claude_api_key)
        self.model = settings.ai_model_override or DEFAULT_CLAUDE_MODEL
        if settings.ai_model_override:
            logger.info(f"Claude using model override: {self.model}")
        else:
            logger.info(f"Claude using default model: {self.model}")

    def prepare_image(self, image_bytes: bytes) -> str:
        """Prepare image as base64 string for Claude"""
        return base64.b64encode(image_bytes).decode('utf-8')

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Claude API call with image and text"""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_data
                                }
                            }
                        ]
                    }
                ]
            )
            return response.content[0].text
        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Claude API call with conversation history"""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages
            )
            return response.content[0].text
        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Claude API call with text only (no image)"""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}]
            )
            return response.content[0].text
        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

    def build_conversation_messages(
        self,
        initial_prompt: str,
        image_data: Any,
        previous_messages: Optional[list],
        current_question: str
    ) -> list:
        """Build conversation messages in Claude format"""
        # Initial message with prompt and image
        initial_message = {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": initial_prompt
                },
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_data
                    }
                }
            ]
        }
        messages = [initial_message]

        # Add previous conversation if available
        if previous_messages:
            for msg in previous_messages:
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })
            # Add current question
            messages.append({
                "role": "user",
                "content": current_question
            })

        return messages

    def get_provider_name(self) -> AIProvider:
        return AIProvider.CLAUDE

    def get_model_name(self) -> str:
        return self.model

    async def stream_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream Claude API call with image and text"""
        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_data
                                }
                            }
                        ]
                    }
                ]
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            raise Exception(f"Claude streaming API error: {str(e)}")

    async def stream_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream Claude API call with conversation history"""
        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            raise Exception(f"Claude conversation streaming API error: {str(e)}")
