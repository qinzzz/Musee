from abc import ABC, abstractmethod
from typing import Dict, Any, AsyncGenerator
from app.models.artwork import ToneType, AIProvider


class AIServiceInterface(ABC):
    """Abstract base class for AI artwork analysis services"""

    @abstractmethod
    async def analyze_artwork(self, image_bytes: bytes, tone: ToneType) -> AsyncGenerator[str, None]:
        """
        Analyze artwork with streaming response based on tone

        Args:
            image_bytes: Raw image data
            tone: Analysis tone (professional, general, sarcastic, etc.)

        Yields:
            str: Streaming text chunks of artwork analysis
        """
        pass

    @abstractmethod
    async def identify_artist(self, image_bytes: bytes) -> str:
        """
        Identify the artist and artwork details (non-streaming)

        Args:
            image_bytes: Raw image data

        Returns:
            str: Complete artist identification analysis
        """
        pass

    @abstractmethod
    async def get_artwork_bite(self, image_bytes: bytes, artist_name: str, artwork_name: str = "Unknown") -> str:
        """
        Get a concise, interesting bite of information about the artwork

        Args:
            image_bytes: Raw image data
            artist_name: Name of the artist
            artwork_name: Name of the artwork (optional)

        Returns:
            str: Concise (max 50 words) interesting fact about the artwork
        """
        pass

    @abstractmethod
    def get_provider_name(self) -> AIProvider:
        """Return the AI provider name"""
        pass


class AIServiceFactory:
    """Factory for creating AI service instances"""

    _services: Dict[AIProvider, AIServiceInterface] = {}

    @classmethod
    def register_service(cls, provider: AIProvider, service: AIServiceInterface):
        """Register an AI service implementation"""
        cls._services[provider] = service

    @classmethod
    def get_service(cls, provider: AIProvider) -> AIServiceInterface:
        """Get AI service by provider name"""
        if provider not in cls._services:
            raise ValueError(f"AI service '{provider}' not registered")
        return cls._services[provider]

    @classmethod
    def get_available_providers(cls) -> list[AIProvider]:
        """Get list of available AI providers"""
        return list(cls._services.keys())