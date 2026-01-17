"""
AI Service - Concrete implementation that orchestrates AI operations.
This service handles all common logic (prompt loading, image encoding, request construction)
and delegates only the actual API calls to provider-specific clients.
"""

from typing import Dict, Any, Optional, AsyncGenerator
import json
from app.models.artwork import AIProvider
from app.utils.prompt_loader import (
    get_artist_identification_prompt_v2,
    get_artwork_bite_prompt_v2,
    get_suggest_topics_prompt_v2
)
from app.services.ai_client_interface import AIClientInterface


class AIService:
    """
    Concrete AI service that orchestrates artwork analysis.
    Handles prompt loading, image encoding, and request construction,
    then delegates API calls to provider-specific clients.
    """

    def __init__(self, ai_client: AIClientInterface):
        """
        Initialize AI service with a specific AI client

        Args:
            ai_client: Provider-specific AI client (Claude, OpenAI, Gemini)
        """
        self.ai_client = ai_client

    # Utility methods
    @staticmethod
    def get_language_map() -> Dict[str, str]:
        """Get mapping of language codes to full names"""
        return {
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
            "ru": "Russian",
            "ar": "Arabic",
            "hi": "Hindi"
        }

    @staticmethod
    def build_language_instruction(language: Optional[str]) -> str:
        """Build language instruction string for prompts"""
        if not language:
            return ""

        language_map = AIService.get_language_map()
        language_name = language_map.get(language.lower(), language)
        return f"\n\nIMPORTANT: Respond in {language_name} ({language}). All your output should be in {language_name}."

    @staticmethod
    def parse_json_response(response_text: str) -> Any:
        """Parse JSON response, handling markdown code blocks"""
        response_text = response_text.strip()

        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        return json.loads(response_text)

    @staticmethod
    def build_summary_prompt(
        artist_name: str,
        artwork_name: str,
        conversation_history: Optional[list],
        language: Optional[str] = None
    ) -> str:
        """Build prompt for generating artwork summary"""
        language_instruction = AIService.build_language_instruction(language)

        if conversation_history:
            conversation_text = "\n".join([
                f"{msg.role}: {msg.content}"
                for msg in conversation_history
            ])

            return f"""Based on this image and conversation about {artwork_name} by {artist_name}:

{conversation_text}

Generate ONE fun, engaging, memorable sentence that captures the essence of this artwork. Make it witty, intriguing, or surprising - something that would make someone want to learn more about this piece. Keep it under 20 words.

Return ONLY the one sentence, no quotes, no extra text.{language_instruction}"""
        else:
            return f"""Looking at this artwork {artwork_name} by {artist_name}, generate ONE fun, engaging, memorable sentence that captures its essence. Make it witty, intriguing, or surprising - something that would make someone want to learn more about this piece. Keep it under 20 words.

Return ONLY the one sentence, no quotes, no extra text.{language_instruction}"""

    @staticmethod
    def clean_summary_response(summary: str) -> str:
        """Clean summary response by removing quotes"""
        summary = summary.strip()
        summary = summary.strip('"').strip("'")
        return summary

    # Main service methods
    async def identify_artist(
        self,
        image_bytes: bytes,
        identity: str = "default",
        language: Optional[str] = None
    ) -> str:
        """
        Identify the artist and artwork details (non-streaming)

        Args:
            image_bytes: Raw image data
            identity: AI identity/persona to use
            language: Language code for response

        Returns:
            str: Complete artist identification analysis
        """
        # Prepare image in provider-specific format
        image_data = self.ai_client.prepare_image(image_bytes)

        # Load prompt
        prompt = get_artist_identification_prompt_v2(identity, language=language)

        # Call API through client
        response = await self.ai_client.call_with_image_and_text(
            prompt=prompt,
            image_data=image_data,
            max_tokens=2000,  # Increased for Gemini compatibility
            temperature=0.7
        )

        return response

    async def identify_artist_stream(
        self,
        image_bytes: bytes,
        identity: str = "default",
        language: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream identify the artist and artwork details

        Args:
            image_bytes: Raw image data
            identity: AI identity/persona to use
            language: Language code for response

        Yields:
            str: Text chunks as they arrive
        """
        # Prepare image in provider-specific format
        image_data = self.ai_client.prepare_image(image_bytes)

        # Load prompt
        prompt = get_artist_identification_prompt_v2(identity, language=language)

        # Stream API through client
        async for chunk in self.ai_client.stream_with_image_and_text(
            prompt=prompt,
            image_data=image_data,
            max_tokens=2000,
            temperature=0.7
        ):
            yield chunk

    async def get_artwork_bite(
        self,
        image_bytes: bytes,
        artist_name: str,
        artwork_name: str = "Unknown",
        followup_question: str = None,
        previous_messages: list = None,
        identity: str = "default",
        language: Optional[str] = None
    ) -> str:
        """
        Get a concise, interesting bite of information about the artwork

        Args:
            image_bytes: Raw image data
            artist_name: Name of the artist
            artwork_name: Name of the artwork
            followup_question: Optional followup question
            previous_messages: List of previous ConversationMessage objects
            identity: AI identity/persona to use
            language: Language code for response

        Returns:
            str: Concise interesting fact about the artwork
        """
        # Prepare image in provider-specific format
        image_data = self.ai_client.prepare_image(image_bytes)

        # Load base prompt
        prompt = get_artwork_bite_prompt_v2(artist_name, artwork_name, identity, language=language)

        # Determine current question
        current_question = "Tell me more about this artwork." if not followup_question else followup_question

        # Build conversation messages in provider-specific format
        messages = self.ai_client.build_conversation_messages(
            initial_prompt=prompt,
            image_data=image_data,
            previous_messages=previous_messages,
            current_question=current_question
        )

        # Call API through client
        response = await self.ai_client.call_with_conversation(
            messages=messages,
            max_tokens=200,  # Increased for Gemini compatibility
            temperature=0.8
        )

        return response

    async def suggest_topics(
        self,
        artist_name: str,
        artwork_name: str,
        previous_insights: list,
        identity: str = "default",
        language: Optional[str] = None
    ) -> list:
        """
        Suggest next topics to explore based on conversation history

        Args:
            artist_name: Name of the artist
            artwork_name: Name of the artwork
            previous_insights: List of previous insight strings
            identity: AI identity/persona to use
            language: Language code for response

        Returns:
            list: Array of suggested topic strings
        """
        # Load prompt
        prompt = get_suggest_topics_prompt_v2(
            artist_name=artist_name,
            artwork_name=artwork_name,
            previous_insights=previous_insights,
            identity=identity,
            language=language
        )

        # Call API through client (text-only)
        response = await self.ai_client.call_text_only(
            prompt=prompt,
            max_tokens=150,  # Increased for Gemini compatibility
            temperature=0.7
        )

        # Parse JSON response
        return self.parse_json_response(response)

    async def generate_summary(
        self,
        image_bytes: bytes,
        artist_name: str,
        artwork_name: str,
        conversation_history: list,
        identity: str = "default",
        language: Optional[str] = None
    ) -> str:
        """
        Generate a fun, one-sentence summary of the artwork

        Args:
            image_bytes: Raw image data
            artist_name: Name of the artist
            artwork_name: Name of the artwork
            conversation_history: List of previous ConversationMessage objects
            identity: AI identity/persona to use
            language: Language code for response

        Returns:
            str: One-sentence fun summary
        """
        # Prepare image in provider-specific format
        image_data = self.ai_client.prepare_image(image_bytes)

        # Build summary prompt
        prompt = self.build_summary_prompt(artist_name, artwork_name, conversation_history, language)

        # Call API through client
        response = await self.ai_client.call_with_image_and_text(
            prompt=prompt,
            image_data=image_data,
            max_tokens=100,  # Increased for Gemini compatibility (summary can be longer)
            temperature=0.9
        )

        # Clean and return
        return self.clean_summary_response(response)

    def get_provider_name(self) -> AIProvider:
        """Return the AI provider name"""
        return self.ai_client.get_provider_name()

    def get_model_name(self) -> str:
        """Return the model name being used"""
        return self.ai_client.get_model_name()


class AIServiceFactory:
    """Factory for creating AI service instances"""

    _clients: Dict[AIProvider, AIClientInterface] = {}

    @classmethod
    def register_client(cls, provider: AIProvider, client: AIClientInterface):
        """Register an AI client implementation"""
        cls._clients[provider] = client

    @classmethod
    def get_service(cls, provider: AIProvider) -> AIService:
        """Get AI service by provider name"""
        if provider not in cls._clients:
            raise ValueError(f"AI client '{provider}' not registered")
        return AIService(cls._clients[provider])

    @classmethod
    def get_available_providers(cls) -> list[AIProvider]:
        """Get list of available AI providers"""
        return list(cls._clients.keys())
