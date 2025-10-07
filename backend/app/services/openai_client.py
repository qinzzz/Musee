import base64
from typing import AsyncGenerator
from openai import AsyncOpenAI
from app.services.ai_service import AIServiceInterface
from app.models.artwork import ToneType, AIProvider
from app.config.settings import settings
from app.utils.prompt_loader import get_artist_identification_prompt, get_artwork_analysis_prompt


class OpenAIClient(AIServiceInterface):
    """OpenAI GPT-4 Vision implementation for artwork analysis"""
    
    def __init__(self):
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
    
    async def analyze_artwork(self, image_bytes: bytes, tone: ToneType) -> AsyncGenerator[str, None]:
        """Analyze artwork using OpenAI GPT-4 Vision with streaming"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the complete prompt from file
        prompt = get_artwork_analysis_prompt(tone)

        try:
            stream = await self.client.chat.completions.create(
                model="gpt-4o",
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
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
                temperature=0.7,
                stream=True
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    async def identify_artist(self, image_bytes: bytes) -> str:
        """Identify artist and artwork using OpenAI GPT-4 Vision (non-streaming)"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the shared artist identification prompt
        prompt = get_artist_identification_prompt()

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
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
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1500,
                temperature=0.7
            )

            return response.choices[0].message.content

        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    def get_provider_name(self) -> AIProvider:
        return AIProvider.OPENAI