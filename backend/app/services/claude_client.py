import base64
from typing import AsyncGenerator
from anthropic import AsyncAnthropic
from app.services.ai_service import AIServiceInterface
from app.models.artwork import ToneType, AIProvider
from app.config.settings import settings
from app.utils.prompt_loader import get_artist_identification_prompt, get_artwork_analysis_prompt, get_artwork_bite_prompt


class ClaudeClient(AIServiceInterface):
    """Anthropic Claude implementation for artwork analysis"""
    
    def __init__(self):
        if not settings.claude_api_key:
            raise ValueError("Claude API key not configured")
        self.client = AsyncAnthropic(api_key=settings.claude_api_key)
    
    async def analyze_artwork(self, image_bytes: bytes, tone: ToneType) -> AsyncGenerator[str, None]:
        """Analyze artwork using Anthropic Claude with streaming"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the complete prompt from file
        prompt = get_artwork_analysis_prompt(tone)

        try:
            async with self.client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_base64
                                }
                            }
                        ]
                    }
                ]
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

    async def identify_artist(self, image_bytes: bytes) -> str:
        """Identify artist and artwork using Anthropic Claude (non-streaming)"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the shared artist identification prompt
        prompt = get_artist_identification_prompt()

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1500,
                temperature=0.7,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_base64
                                }
                            }
                        ]
                    }
                ]
            )

            return response.content[0].text

        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

    async def get_artwork_bite(self, image_bytes: bytes, artist_name: str, artwork_name: str = "Unknown") -> str:
        """Get a concise, interesting bite of information about the artwork"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the artwork bite prompt with artist and artwork names
        prompt = get_artwork_bite_prompt(artist_name, artwork_name)

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=150,  # ~50 words
                temperature=0.8,  # Higher temperature for more creative/interesting facts
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": image_base64
                                }
                            }
                        ]
                    }
                ]
            )

            return response.content[0].text

        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

    def get_provider_name(self) -> AIProvider:
        return AIProvider.CLAUDE