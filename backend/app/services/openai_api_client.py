"""
OpenAI API Client - Handles only the actual API calls to OpenAI.
All business logic, prompt loading, and request construction is handled by AIService.
"""

import base64
from typing import Optional, Any, AsyncGenerator, Dict, List
from openai import AsyncOpenAI
from app.services.ai_client_interface import AIClientInterface
from app.models.artwork import AIProvider
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Default model
DEFAULT_OPENAI_MODEL = "gpt-5"


class OpenAIAPIClient(AIClientInterface):
    """OpenAI-specific API client - only handles API calls"""

    def __init__(self):
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.ai_model_override or DEFAULT_OPENAI_MODEL
        if settings.ai_model_override:
            logger.info(f"OpenAI using model override: {self.model}")
        else:
            logger.info(f"OpenAI using default model: {self.model}")

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

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make OpenAI API call with image and text"""
        logger.info(f"OpenAI API call: model={self.model}, max_tokens={max_tokens}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                **self._get_common_params()
            )
            return response.choices[0].message.content
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
        logger.info(f"OpenAI conversation API call: model={self.model}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                **self._get_common_params()
            )
            return response.choices[0].message.content
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
        logger.info(f"OpenAI text-only API call: model={self.model}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                **self._get_common_params()
            )
            return response.choices[0].message.content
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

        content_parts = [{"type": "text", "text": initial_prompt}]

        if image_data:
            payloads = image_data if isinstance(image_data, list) else [image_data]
            for data in payloads:
                if not data:
                    continue
                content_parts.append(_image_part(data))

        messages = [{"role": "user", "content": content_parts}]

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
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream OpenAI API call with image and text"""
        logger.info(f"OpenAI streaming API call: model={self.model}, max_tokens={max_tokens}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_data}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                stream=True,
                **self._get_common_params()
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
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
        logger.info(f"OpenAI conversation streaming API call: model={self.model}")
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                stream=True,
                **self._get_common_params()
            )
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            raise Exception(f"OpenAI conversation streaming API error: {str(e)}")
