"""
Abstract interface for AI provider-specific API clients.
These clients only handle the actual API calls to external LLM providers.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Any, Dict, AsyncGenerator, List
from app.models.artwork import AIProvider


@dataclass(frozen=True)
class AITextResult:
    """Text response plus provider usage metadata when available."""

    text: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None


@dataclass(frozen=True)
class AIStreamChunk:
    """Streaming response event plus provider usage metadata when available."""

    type: str
    text: str = ""
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None


class AIClientInterface(ABC):
    """Abstract interface for provider-specific API clients"""

    @abstractmethod
    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Make a simple API call with image and text prompt

        Args:
            prompt: Text prompt
            image_data: Provider-specific image format (base64 string, PIL Image, etc.)
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter
            response_schema: Optional JSON schema to enforce response format

        Returns:
            str: Model's text response
        """
        pass

    @abstractmethod
    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Make API call with conversation history

        Args:
            messages: Provider-specific message format
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter
            response_schema: Optional JSON schema to enforce response format

        Returns:
            str: Model's text response
        """
        pass

    @abstractmethod
    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Make a text-only API call (no image)

        Args:
            prompt: Text prompt
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter
            response_schema: Optional JSON schema to enforce response format

        Returns:
            str: Model's text response
        """
        pass

    async def call_with_image_and_text_result(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> AITextResult:
        """Structured image+text result. Subclasses can override to include token usage."""
        text = await self.call_with_image_and_text(
            prompt=prompt,
            image_data=image_data,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
        )
        return AITextResult(text=text)

    async def call_with_conversation_result(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> AITextResult:
        """Structured conversation result. Subclasses can override to include token usage."""
        text = await self.call_with_conversation(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
        )
        return AITextResult(text=text)

    async def call_text_only_result(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None,
    ) -> AITextResult:
        """Structured text-only result. Subclasses can override to include token usage."""
        text = await self.call_text_only(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
        )
        return AITextResult(text=text)

    @abstractmethod
    def prepare_image(self, image_bytes: bytes) -> Any:
        """
        Prepare image in provider-specific format

        Args:
            image_bytes: Raw image bytes

        Returns:
            Provider-specific image format (base64 string, PIL Image, etc.)
        """
        pass

    @abstractmethod
    def build_conversation_messages(
        self,
        initial_prompt: str,
        image_data: Any,
        previous_messages: Optional[list],
        current_question: str
    ) -> list:
        """
        Build conversation messages in provider-specific format

        Args:
            initial_prompt: Initial system/user prompt
            image_data: Provider-specific image payload (single image or list, optional)
            previous_messages: Previous conversation messages
            current_question: Current user question

        Returns:
            list: Provider-specific message format
        """
        pass

    @abstractmethod
    def get_provider_name(self) -> AIProvider:
        """Return the AI provider name"""
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        """Return the model name being used"""
        pass

    @abstractmethod
    async def stream_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream API call with image and text prompt

        Args:
            prompt: Text prompt
            image_data: Provider-specific image format (base64 string, PIL Image, etc.)
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter
            response_schema: Optional JSON schema to enforce response format

        Yields:
            str: Text chunks as they arrive from the API
        """
        pass

    async def stream_with_image_and_text_result(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> AsyncGenerator[AIStreamChunk, None]:
        """Structured streaming image+text result. Subclasses can include token usage."""
        async for text in self.stream_with_image_and_text(
            prompt=prompt,
            image_data=image_data,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
            reasoning_effort=reasoning_effort,
        ):
            yield AIStreamChunk(type="text", text=text)

    @abstractmethod
    async def stream_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream API call with conversation history

        Args:
            messages: Provider-specific message format
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter
            response_schema: Optional JSON schema to enforce response format

        Yields:
            str: Text chunks as they arrive from the API
        """
        pass

    async def stream_with_conversation_result(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[AIStreamChunk, None]:
        """Structured streaming conversation result. Subclasses can include token usage."""
        async for text in self.stream_with_conversation(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_schema=response_schema,
        ):
            yield AIStreamChunk(type="text", text=text)
