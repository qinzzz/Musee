"""
OpenAI API Client - Handles only the actual API calls to OpenAI.
All business logic, prompt loading, and request construction is handled by AIService.
"""

import base64
from typing import Optional, Any, AsyncGenerator, Dict, List
from openai import AsyncOpenAI
from app.services.ai_client_interface import AIClientInterface, AIStreamChunk, AITextResult
from app.models.artwork import AIProvider
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Default model
DEFAULT_OPENAI_MODEL = "gpt-5"


class OpenAIAPIClient(AIClientInterface):
    """OpenAI-specific API client - only handles API calls"""

    def __init__(self, model: Optional[str] = None):
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model or settings.ai_model_override or DEFAULT_OPENAI_MODEL
        logger.info(f"OpenAI client initialised with model: {self.model}")

    def _get_common_params(self, **kwargs):
        """Get common parameters for API calls"""
        params = kwargs.copy()
        if settings.openai_reasoning_effort:
            params["reasoning_effort"] = settings.openai_reasoning_effort
        if settings.openai_verbosity:
            params["verbosity"] = settings.openai_verbosity
        return params

    def prepare_image(self, image_bytes: bytes) -> str:
        """Prepare image as base64 string for OpenAI"""
        return base64.b64encode(image_bytes).decode('utf-8')

    @staticmethod
    def _build_image_parts(image_data: Any) -> List[Dict[str, Any]]:
        payloads = image_data if isinstance(image_data, list) else [image_data]
        parts: List[Dict[str, Any]] = []
        for data in payloads:
            if not data:
                continue
            parts.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{data}",
                    "detail": "high"
                }
            })
        return parts

    @staticmethod
    def _extract_usage(response: Any) -> tuple[Optional[int], Optional[int]]:
        usage = getattr(response, "usage", None)
        if not usage:
            return None, None
        input_tokens = getattr(usage, "prompt_tokens", None) or getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "completion_tokens", None) or getattr(usage, "output_tokens", None)
        return input_tokens, output_tokens

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make OpenAI API call with image and text"""
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
        """Make OpenAI API call with image and text and preserve token usage."""
        logger.info(f"OpenAI API call: model={self.model}, max_tokens={max_tokens}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {
                        "role": "user",
                        "content": self._build_image_parts(image_data) or "Please proceed."
                    }
                ],
                **self._get_common_params()
            )
            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=response.choices[0].message.content or "",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make OpenAI API call with conversation history"""
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
        """Make OpenAI API call with conversation history and preserve token usage."""
        logger.info(f"OpenAI conversation API call: model={self.model}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                **self._get_common_params()
            )
            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=response.choices[0].message.content or "",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make OpenAI API call with text only (no image)"""
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
        """Make OpenAI API call with text only and preserve token usage."""
        logger.info(f"OpenAI text-only API call: model={self.model}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": "Please proceed."},
                ],
                **self._get_common_params()
            )
            input_tokens, output_tokens = self._extract_usage(response)
            return AITextResult(
                text=response.choices[0].message.content or "",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    def build_conversation_messages(
        self,
        initial_prompt: str,
        image_data: Any,
        previous_messages: Optional[list],
        current_question: str
    ) -> list:
        """Build conversation messages in OpenAI format"""

        def _image_part(encoded: str) -> Dict[str, Any]:
            return {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{encoded}",
                    "detail": "high"
                }
            }

        messages = [{"role": "system", "content": initial_prompt}]

        content_parts = []
        if image_data:
            payloads = image_data if isinstance(image_data, list) else [image_data]
            for data in payloads:
                if not data:
                    continue
                content_parts.append(_image_part(data))

        messages.append({"role": "user", "content": content_parts if content_parts else "Please proceed."})

        if previous_messages:
            for msg in previous_messages:
                if msg is None:
                    continue
                role = getattr(msg, "role", None)
                if role is None and isinstance(msg, dict):
                    role = msg.get("role", "user")
                elif role is None:
                    role = "user"
                content = getattr(msg, "content", None)
                if content is None and isinstance(msg, dict):
                    content = msg.get("content", "")
                elif content is None:
                    content = ""
                messages.append({"role": role, "content": content})

        if current_question:
            messages.append({"role": "user", "content": current_question})

        return messages

    def get_provider_name(self) -> AIProvider:
        return AIProvider.OPENAI

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
        """Stream OpenAI API call with image and text"""
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
        """Stream OpenAI image+text chunks and emit final token usage when available."""
        logger.info(f"OpenAI streaming API call: model={self.model}, max_tokens={max_tokens}, reasoning_effort={reasoning_effort or '(default)'}")
        try:
            params = self._get_common_params()
            if reasoning_effort:
                params["reasoning_effort"] = reasoning_effort
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {
                        "role": "user",
                        "content": self._build_image_parts(image_data) or "Please proceed."
                    }
                ],
                stream=True,
                stream_options={"include_usage": True},
                **params
            )
            async for chunk in response:
                input_tokens, output_tokens = self._extract_usage(chunk)
                if input_tokens is not None or output_tokens is not None:
                    yield AIStreamChunk(
                        type="usage",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )
                if chunk.choices and chunk.choices[0].delta.content:
                    yield AIStreamChunk(type="text", text=chunk.choices[0].delta.content)
        except Exception as e:
            raise Exception(f"OpenAI streaming API error: {str(e)}")

    async def stream_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream OpenAI API call with conversation history"""
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
        """Stream OpenAI conversation chunks and emit final token usage when available."""
        logger.info(f"OpenAI conversation streaming API call: model={self.model}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
                **self._get_common_params()
            )
            async for chunk in response:
                input_tokens, output_tokens = self._extract_usage(chunk)
                if input_tokens is not None or output_tokens is not None:
                    yield AIStreamChunk(
                        type="usage",
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                    )
                if chunk.choices and chunk.choices[0].delta.content:
                    yield AIStreamChunk(type="text", text=chunk.choices[0].delta.content)
        except Exception as e:
            raise Exception(f"OpenAI conversation streaming API error: {str(e)}")
