import google.generativeai as genai
from typing import AsyncGenerator
from app.services.ai_service import AIServiceInterface
from app.models.artwork import ToneType, AIProvider
from app.config.settings import settings
from app.utils.prompt_loader import get_artist_identification_prompt, get_artwork_analysis_prompt
from PIL import Image
import io


class GeminiClient(AIServiceInterface):
    """Google Gemini implementation for artwork analysis"""
    
    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key not configured")
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel('gemini-pro-vision')
    
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

    async def identify_artist(self, image_bytes: bytes) -> str:
        """Identify artist and artwork using Google Gemini (non-streaming)"""

        # Convert bytes to PIL Image for Gemini
        image = Image.open(io.BytesIO(image_bytes))

        # Get the shared artist identification prompt
        prompt = get_artist_identification_prompt()

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

    def get_provider_name(self) -> AIProvider:
        return AIProvider.GEMINI