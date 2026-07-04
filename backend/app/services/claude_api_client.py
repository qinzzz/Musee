"""
Claude API Client - Handles only the actual API calls to Anthropic's Claude.
All business logic, prompt loading, and request construction is handled by AIService.
"""

import base64
from typing import Optional, Any, AsyncGenerator, Dict, List
from anthropic import AsyncAnthropic
from app.services.ai_client_interface import AIClientInterface, AIStreamChunk, AITextResult
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

    @staticmethod
    def _build_image_content(image_data: Any) -> List[Dict[str, Any]]:
        payloads = image_data if isinstance(image_data, list) else [image_data]
        content: List[Dict[str, Any]] = []
        for data in payloads:
            if not data:
                continue
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": data
                }
            })
        return content

    @staticmethod
    def _extract_usage(response: Any) -> tuple[Optional[int], Optional[int]]:
        usage = getattr(response, "usage", None)
        if not usage:
            return None, None
        return getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None)

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Claude API call with image and text"""
        return (
            await self.call_with_image_and_text_result(
                prompt=prompt,
                image_data=image_data,
                max_tokens=max_tokens,
                temperature=temperature,
                response_schema=response_schema,
            )
        ).text

    async def call_with_image_and_text_result(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AITextResult:
        """Make Claude API call with image and text and preserve token usage."""
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
                            *self._build_image_content(image_data),
                        ]
                    }
                ]
            )
            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=response.content[0].text,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
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
        return (
            await self.call_with_conversation_result(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_schema=response_schema,
            )
        ).text

    async def call_with_conversation_result(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AITextResult:
        """Make Claude API call with conversation history and preserve token usage."""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages
            )
            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=response.content[0].text,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
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
        return (
            await self.call_text_only_result(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                response_schema=response_schema,
            )
        ).text

    async def call_text_only_result(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AITextResult:
        """Make Claude API call with text only and preserve token usage."""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}]
            )
            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=response.content[0].text,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
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
        content = [{"type": "text", "text": initial_prompt}]
        if image_data:
            payloads = image_data if isinstance(image_data, list) else [image_data]
            for data in payloads:
                if not data:
                    continue
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": data
                    }
                })
        initial_message = {
            "role": "user",
            "content": content
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
        async for chunk in self.stream_with_image_and_text_result(
            prompt=prompt,
            image_data=image_data,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
            reasoning_effort=reasoning_effort,
        ):
            if chunk.type == "text":
                yield chunk.text

    async def stream_with_image_and_text_result(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> AsyncGenerator[AIStreamChunk, None]:
        """Stream Claude image+text chunks and emit final token usage when available."""
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
                            *self._build_image_content(image_data),
                        ]
                    }
                ]
            ) as stream:
                async for text in stream.text_stream:
                    yield AIStreamChunk(type="text", text=text)
                final_message = await stream.get_final_message()
                input_tokens, output_tokens = self._extract_usage(final_message)
                if input_tokens is not None or output_tokens is not None:
                    yield AIStreamChunk(
                        type="usage",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )
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
        async for chunk in self.stream_with_conversation_result(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
        ):
            if chunk.type == "text":
                yield chunk.text

    async def stream_with_conversation_result(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[AIStreamChunk, None]:
        """Stream Claude conversation chunks and emit final token usage when available."""
        try:
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages
            ) as stream:
                async for text in stream.text_stream:
                    yield AIStreamChunk(type="text", text=text)
                final_message = await stream.get_final_message()
                input_tokens, output_tokens = self._extract_usage(final_message)
                if input_tokens is not None or output_tokens is not None:
                    yield AIStreamChunk(
                        type="usage",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )
        except Exception as e:
            raise Exception(f"Claude conversation streaming API error: {str(e)}")
