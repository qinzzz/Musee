"""
Gemini API Client - Handles only the actual API calls to Google Gemini.
All business logic, prompt loading, and request construction is handled by AIService.
"""

from google import genai
from google.genai import types
from typing import Optional, Any, AsyncGenerator, Dict, List
from PIL import Image
import io
from app.services.ai_client_interface import AIClientInterface, AIStreamChunk, AITextResult
from app.models.artwork import AIProvider
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Default model
DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"

# Gemini 3 runs reasoning by default, which can blow past the request timeout on
# complex inputs. Cap thinking to keep latency bounded:
#   MINIMAL — vision / structured-JSON identification (fast, no deep reasoning needed)
#   LOW     — text + conversation (a little reasoning, still bounded)
_THINKING_MINIMAL = types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
_THINKING_LOW = types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)

class GeminiAPIClient(AIClientInterface):
    """Gemini-specific API client - only handles API calls"""

    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key not configured")
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_name = settings.ai_model_override or DEFAULT_GEMINI_MODEL
        if settings.ai_model_override:
            logger.info(f"Gemini using model override: {self.model_name}")
        else:
            logger.info(f"Gemini using default model: {self.model_name}")

    def prepare_image(self, image_bytes: bytes) -> bytes:
        """Pass image bytes directly for Gemini"""
        return image_bytes

    @staticmethod
    def _build_image_parts(image_data: Any) -> List[types.Part]:
        payloads = image_data if isinstance(image_data, list) else [image_data]
        parts: List[types.Part] = []
        for data in payloads:
            if not data:
                continue
            parts.append(types.Part.from_bytes(data=data, mime_type="image/jpeg"))
        return parts

    @staticmethod
    def _read_usage_value(usage: Any, *names: str) -> Optional[int]:
        if not usage:
            return None
        for name in names:
            value = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
            if value is not None:
                return int(value)
        return None

    @classmethod
    def _extract_usage(cls, response: Any) -> tuple[Optional[int], Optional[int]]:
        usage = (
            getattr(response, "usage_metadata", None)
            or getattr(response, "usageMetadata", None)
            or (response.get("usageMetadata") if isinstance(response, dict) else None)
            or (response.get("usage_metadata") if isinstance(response, dict) else None)
        )
        input_tokens = cls._read_usage_value(usage, "prompt_token_count", "promptTokenCount")
        output_tokens = cls._read_usage_value(usage, "candidates_token_count", "candidatesTokenCount")
        return input_tokens, output_tokens

    @staticmethod
    def _extract_text(response: Any, empty_context: str, max_tokens: Optional[int] = None) -> str:
        text = getattr(response, "text", None)
        if text:
            return text

        logger.warning("Gemini returned None/empty response for %s", empty_context)
        candidates = getattr(response, "candidates", None)
        if candidates:
            candidate = candidates[0]
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None)
            if parts:
                parts_text = [part.text for part in parts if hasattr(part, "text") and part.text]
                if parts_text:
                    return "".join(parts_text)

            finish_reason = getattr(candidate, "finish_reason", None)
            if finish_reason:
                finish_reason_text = str(finish_reason)
                if max_tokens and "MAX_TOKENS" in finish_reason_text:
                    raise Exception(f"Gemini hit token limit. Current: {max_tokens}")
                raise Exception(f"Gemini blocked response: {finish_reason_text}")

        raise Exception("Gemini returned empty response")

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Gemini API call with image and text"""
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
        """Make Gemini API call with image and text and preserve token usage."""
        logger.debug(f"Gemini call_with_image_and_text: {prompt[:100]}...")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[
                    prompt,
                    *self._build_image_parts(image_data),
                ],
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=response_schema,
                    thinking_config=_THINKING_MINIMAL,
                )
            )

            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=self._extract_text(response, "image+text call", max_tokens=max_tokens),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Gemini API call with conversation history"""
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
        """Make Gemini API call with conversation history and preserve token usage."""
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=messages,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json" if response_schema else None,
                    response_schema=response_schema,
                    thinking_config=_THINKING_LOW,
                )
            )

            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=self._extract_text(response, "conversation call"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Gemini API call with text only (no image)"""
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
        """Make Gemini API call with text only and preserve token usage."""
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=response_schema,
                    thinking_config=_THINKING_LOW,
                )
            )

            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=self._extract_text(response, "text-only call"),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    def build_conversation_messages(
        self,
        initial_prompt: str,
        image_data: Any,
        previous_messages: Optional[list],
        current_question: str
    ) -> list:
        """Build conversation messages in Gemini format with proper multi-turn structure"""
        contents = []
        
        # System instructions as first user message
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=initial_prompt)]
        ))

        if image_data:
            payloads = image_data if isinstance(image_data, list) else [image_data]
            parts = [types.Part.from_text(text="Here is the artwork to analyze:")]
            for data in payloads:
                if not data:
                    continue
                parts.append(types.Part.from_bytes(data=data, mime_type="image/jpeg"))
            contents.append(types.Content(
                role="user",
                parts=parts
            ))
        
        # Previous conversation
        if previous_messages:
            for msg in previous_messages:
                role = "model" if msg.role == "assistant" else "user"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.content)]
                ))
        
        # Current question
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=current_question)]
        ))
        
        return contents

    def get_provider_name(self) -> AIProvider:
        return AIProvider.GEMINI

    def get_model_name(self) -> str:
        return self.model_name

    async def stream_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream Gemini API call with image and text"""
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
        """Stream Gemini image+text chunks and emit final token usage when available."""
        logger.debug(f"Gemini streaming call: {prompt[:100]}...")
        try:
            response = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=[
                    prompt,
                    *self._build_image_parts(image_data),
                ],
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=response_schema,
                    thinking_config=_THINKING_MINIMAL,
                )
            )

            full_text_so_far = ""
            last_usage: tuple[Optional[int], Optional[int]] = (None, None)
            async for chunk in response:
                usage = self._extract_usage(chunk)
                if usage != (None, None):
                    last_usage = usage
                if chunk.text:
                    # Some versions of the SDK or specific models might return cumulative text in chunk.text
                    # We calculate the delta to ensure we only yield NEW text to the frontend
                    current_text = chunk.text
                    if current_text.startswith(full_text_so_far):
                        delta = current_text[len(full_text_so_far):]
                        full_text_so_far = current_text
                        if delta:
                            yield AIStreamChunk(type="text", text=delta)
                    else:
                        # If for some reason it's NOT cumulative, just yield it as is
                        yield AIStreamChunk(type="text", text=current_text)
                        full_text_so_far += current_text
            if last_usage != (None, None):
                yield AIStreamChunk(
                    type="usage",
                    input_tokens=last_usage[0],
                    output_tokens=last_usage[1],
                )
        except Exception as e:
            raise Exception(f"Gemini streaming API error: {str(e)}")

    async def stream_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream Gemini API call with conversation history"""
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
        """Stream Gemini conversation chunks and emit final token usage when available."""
        logger.debug(f"Gemini conversation streaming call")
        try:
            response = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=messages,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json" if response_schema else None,
                    response_schema=response_schema,
                    thinking_config=_THINKING_LOW,
                )
            )

            full_text_so_far = ""
            last_usage: tuple[Optional[int], Optional[int]] = (None, None)
            async for chunk in response:
                usage = self._extract_usage(chunk)
                if usage != (None, None):
                    last_usage = usage
                if chunk.text:
                    # Ensure we only yield the delta to prevent duplication in the frontend
                    current_text = chunk.text
                    if current_text.startswith(full_text_so_far):
                        delta = current_text[len(full_text_so_far):]
                        full_text_so_far = current_text
                        if delta:
                            yield AIStreamChunk(type="text", text=delta)
                    else:
                        yield AIStreamChunk(type="text", text=current_text)
                        full_text_so_far += current_text
            if last_usage != (None, None):
                yield AIStreamChunk(
                    type="usage",
                    input_tokens=last_usage[0],
                    output_tokens=last_usage[1],
                )
        except Exception as e:
            raise Exception(f"Gemini conversation streaming API error: {str(e)}")
