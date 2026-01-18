"""
Abstract interface for AI provider-specific API clients.
These clients only handle the actual API calls to external LLM providers.
"""

from abc import ABC, abstractmethod
from typing import Optional, Any, Dict, AsyncGenerator
from app.models.artwork import AIProvider


class AIClientInterface(ABC):
    """Abstract interface for provider-specific API clients"""

    @abstractmethod
    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float
    ) -> str:
        """
        Make a simple API call with image and text prompt

        Args:
            prompt: Text prompt
            image_data: Provider-specific image format (base64 string, PIL Image, etc.)
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter

        Returns:
            str: Model's text response
        """
        pass

    @abstractmethod
    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float
    ) -> str:
        """
        Make API call with conversation history

        Args:
            messages: Provider-specific message format
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter

        Returns:
            str: Model's text response
        """
        pass

    @abstractmethod
    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7
    ) -> str:
        """
        Make a text-only API call (no image)

        Args:
            prompt: Text prompt
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter

        Returns:
            str: Model's text response
        """
        pass

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
            image_data: Provider-specific image format
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
        temperature: float
    ) -> AsyncGenerator[str, None]:
        """
        Stream API call with image and text prompt

        Args:
            prompt: Text prompt
            image_data: Provider-specific image format (base64 string, PIL Image, etc.)
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter

        Yields:
            str: Text chunks as they arrive from the API
        """
        pass

    @abstractmethod
    async def stream_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float
    ) -> AsyncGenerator[str, None]:
        """
        Stream API call with conversation history

        Args:
            messages: Provider-specific message format
            max_tokens: Maximum tokens for response
            temperature: Temperature parameter

        Yields:
            str: Text chunks as they arrive from the API
        """
        pass
