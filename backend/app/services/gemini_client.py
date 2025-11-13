import google.generativeai as genai
from typing import AsyncGenerator
from app.services.ai_service import AIServiceInterface
from app.models.artwork import ToneType, AIProvider
from app.config.settings import settings
from app.utils.prompt_loader import (
    get_artwork_analysis_prompt,
    get_artist_identification_prompt_v2,
    get_artwork_bite_prompt_v2,
    get_suggest_topics_prompt_v2
)
from PIL import Image
import io


# Default models for each service
DEFAULT_GEMINI_MODEL = "gemini-pro-vision"


class GeminiClient(AIServiceInterface):
    """Google Gemini implementation for artwork analysis"""

    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key not configured")
        genai.configure(api_key=settings.gemini_api_key)
        # Use override if set, otherwise use default
        model_name = settings.ai_model_override or DEFAULT_GEMINI_MODEL
        if settings.ai_model_override:
            print(f"[Gemini] Using model override: {model_name}")
        else:
            print(f"[Gemini] Using default model: {model_name}")
        self.model = genai.GenerativeModel(model_name)
    
    async def analyze_artwork(self, image_bytes: bytes, tone: ToneType) -> AsyncGenerator[str, None]:
        """Analyze artwork using Google Gemini with streaming"""

        # Convert bytes to PIL Image for Gemini
        image = Image.open(io.BytesIO(image_bytes))

        # Get the complete prompt from file
        prompt = get_artwork_analysis_prompt(tone)

        try:
            response = await self.model.generate_content_async(
                [prompt, image],
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=500,
                    temperature=0.7,
                ),
                stream=True
            )

            async for chunk in response:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def identify_artist(self, image_bytes: bytes, identity: str = "default") -> str:
        """Identify artist and artwork using Google Gemini (non-streaming)"""

        # Convert bytes to PIL Image for Gemini
        image = Image.open(io.BytesIO(image_bytes))

        # Get the shared artist identification prompt with identity
        prompt = get_artist_identification_prompt_v2(identity)

        try:
            response = await self.model.generate_content_async(
                [prompt, image],
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=1500,
                    temperature=0.7,
                )
            )

            return response.text

        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def get_artwork_bite(self, image_bytes: bytes, artist_name: str, artwork_name: str = "Unknown", followup_question: str = None, previous_messages: list = None, identity: str = "default") -> str:
        """Get a concise, interesting bite of information about the artwork"""

        # Convert bytes to PIL Image for Gemini
        image = Image.open(io.BytesIO(image_bytes))

        # Get the artwork bite prompt with identity
        prompt = get_artwork_bite_prompt_v2(artist_name, artwork_name, identity)

        # Add conversation context if available
        if previous_messages:
            previous_insights = [msg.content for msg in previous_messages if msg.role == "assistant"]
            if previous_insights:
                prompt += f"\n\nPrevious insights shared:\n" + "\n".join([f"- {insight}" for insight in previous_insights])

        # Add the followup question
        current_question = "Tell me more about this artwork." if not followup_question else followup_question
        prompt += f"\n\n{current_question}"

        try:
            response = await self.model.generate_content_async(
                [prompt, image],
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=150,  # ~50 words
                    temperature=0.8,  # Higher temperature for more creative/interesting facts
                )
            )

            return response.text

        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def suggest_topics(self, artist_name: str, artwork_name: str, previous_insights: list, identity: str = "default") -> list:
        """Suggest next topics to explore based on conversation history"""

        # Use the composable prompt system
        prompt = get_suggest_topics_prompt_v2(
            artist_name=artist_name,
            artwork_name=artwork_name,
            previous_insights=previous_insights,
            identity=identity
        )

        try:
            response = await self.model.generate_content_async(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=100,
                    temperature=0.7,
                )
            )
            topics_json = response.text.strip()

            # Parse JSON response
            import json
            # Remove markdown code blocks if present
            if topics_json.startswith("```"):
                topics_json = topics_json.split("```")[1]
                if topics_json.startswith("json"):
                    topics_json = topics_json[4:]
                topics_json = topics_json.strip()

            return json.loads(topics_json)

        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def generate_summary(self, image_bytes: bytes, artist_name: str, artwork_name: str, conversation_history: list, identity: str = "default") -> str:
        """Generate a fun, one-sentence summary of the artwork based on the image and conversation"""

        # Convert bytes to PIL Image for Gemini
        image = Image.open(io.BytesIO(image_bytes))

        # Build a prompt for generating a fun summary
        if conversation_history:
            conversation_text = "\n".join([
                f"{msg.role}: {msg.content}"
                for msg in conversation_history
            ])

            prompt = f"""Based on this image and conversation about {artwork_name} by {artist_name}:

{conversation_text}

Generate ONE fun, engaging, memorable sentence that captures the essence of this artwork. Make it witty, intriguing, or surprising - something that would make someone want to learn more about this piece. Keep it under 20 words.

Return ONLY the one sentence, no quotes, no extra text."""
        else:
            # No conversation history, generate based on the image and artwork info
            prompt = f"""Looking at this artwork {artwork_name} by {artist_name}, generate ONE fun, engaging, memorable sentence that captures its essence. Make it witty, intriguing, or surprising - something that would make someone want to learn more about this piece. Keep it under 20 words.

Return ONLY the one sentence, no quotes, no extra text."""

        try:
            response = await self.model.generate_content_async(
                [prompt, image],
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=50,
                    temperature=0.9,  # High temperature for creative summaries
                )
            )

            summary = response.text.strip()
            # Remove quotes if present
            summary = summary.strip('"').strip("'")
            return summary

        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    def get_provider_name(self) -> AIProvider:
        return AIProvider.GEMINI