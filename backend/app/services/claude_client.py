import base64
from typing import AsyncGenerator
from anthropic import AsyncAnthropic
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
DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514"


class ClaudeClient(AIServiceInterface):
    """Anthropic Claude implementation for artwork analysis"""

    def __init__(self):
        if not settings.claude_api_key:
            raise ValueError("Claude API key not configured")
        self.client = AsyncAnthropic(api_key=settings.claude_api_key)
        # Use override if set, otherwise use default
        self.model = settings.ai_model_override or DEFAULT_CLAUDE_MODEL
        if settings.ai_model_override:
            print(f"[Claude] Using model override: {self.model}")
        else:
            print(f"[Claude] Using default model: {self.model}")
    
    async def analyze_artwork(self, image_bytes: bytes, tone: ToneType) -> AsyncGenerator[str, None]:
        """Analyze artwork using Anthropic Claude with streaming"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the complete prompt from file
        prompt = get_artwork_analysis_prompt(tone)

        try:
            async with self.client.messages.stream(
                model=self.model,
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

    async def identify_artist(self, image_bytes: bytes, identity: str = "default") -> str:
        """Identify artist and artwork using Anthropic Claude (non-streaming)"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the shared artist identification prompt with identity
        prompt = get_artist_identification_prompt_v2(identity)

        try:
            response = await self.client.messages.create(
                model=self.model,
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

    async def get_artwork_bite(self, image_bytes: bytes, artist_name: str, artwork_name: str = "Unknown", followup_question: str = None, previous_messages: list = None, identity: str = "default") -> str:
        """Get a concise, interesting bite of information about the artwork"""

        # Encode image to base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')

        # Get the base artwork bite prompt with identity
        prompt = get_artwork_bite_prompt_v2(artist_name, artwork_name, identity)

        # Build messages array starting with initial prompt and image
        initial_message = {
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
        messages = [initial_message]

        current_question = "Tell me more about this artwork." if not followup_question else followup_question

        # Add previous conversation messages if available
        if previous_messages:
            for msg in previous_messages:
                # Convert our ConversationMessage to Claude message format
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })
            # Add the followup question
            messages.append({
                "role": "user",
                "content": current_question
            })
        # If no previous messages, the initial message serves as the question

        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=150,  # ~50 words
                temperature=0.8,  # Higher temperature for more creative/interesting facts
                messages=messages
            )

            return response.content[0].text

        except Exception as e:
            raise Exception(f"Claude API error: {str(e)}")

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
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}]
            )
            topics_json = response.content[0].text.strip()

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
            raise Exception(f"Claude API error: {str(e)}")

    def get_provider_name(self) -> AIProvider:
        return AIProvider.CLAUDE