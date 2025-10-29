import base64
from typing import AsyncGenerator
from openai import AsyncOpenAI
from app.services.ai_service import AIServiceInterface
from app.models.artwork import ToneType, AIProvider
from app.config.settings import settings
from app.utils.prompt_loader import (
    get_artwork_analysis_prompt,
    get_artist_identification_prompt_v2,
    get_artwork_bite_prompt_v2,
    get_suggest_topics_prompt_v2
)


# Default models for each service
DEFAULT_OPENAI_MODEL = "gpt-4o"


class OpenAIClient(AIServiceInterface):
    """OpenAI GPT-4 Vision implementation for artwork analysis"""

    def __init__(self):
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        # Use override if set, otherwise use default
        self.model = settings.ai_model_override or DEFAULT_OPENAI_MODEL
        if settings.ai_model_override:
            print(f"[OpenAI] Using model override: {self.model}")
        else:
            print(f"[OpenAI] Using default model: {self.model}")
    
    async def analyze_artwork(self, image_bytes: bytes, tone: ToneType) -> AsyncGenerator[str, None]:
        """Analyze artwork using OpenAI GPT-4 Vision with streaming"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the complete prompt from file
        prompt = get_artwork_analysis_prompt(tone)

        try:
            stream = await self.client.chat.completions.create(
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
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_completion_tokens=500,
                temperature=0.7,
                stream=True
            )

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    async def identify_artist(self, image_bytes: bytes, identity: str = "default") -> str:
        """Identify artist and artwork using OpenAI GPT-4 Vision (non-streaming)"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the shared artist identification prompt
        prompt = get_artist_identification_prompt_v2(identity)

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

    async def get_artwork_bite(self, image_bytes: bytes, artist_name: str, artwork_name: str = "Unknown", followup_question: str = None, previous_messages: list = None, identity: str = "default") -> str:
        """Get a concise, interesting bite of information about the artwork"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the base artwork bite prompt (without history - we use message history instead)
        prompt = get_artwork_bite_prompt_v2(artist_name, artwork_name, identity)

        # Build messages array starting with conversation history
        initial_message = {
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
        messages = [initial_message]
        
        current_question = "Tell me more about this artwork." if not followup_question else followup_question

        # Add previous conversation messages if available
        if previous_messages:
            for msg in previous_messages:
                # Convert our ConversationMessage to OpenAI message format
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })
            messages.append({
                "role": "user",
                "content": current_question
            })

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=150,  # ~50 words
                temperature=0.8  # Higher temperature for more creative/interesting facts
            )

            return response.choices[0].message.content

        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

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
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100,
                temperature=0.7
            )
            topics_json = response.choices[0].message.content.strip()

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
            raise Exception(f"OpenAI API error: {str(e)}")

    def get_provider_name(self) -> AIProvider:
        return AIProvider.OPENAI