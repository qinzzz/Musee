"""
Gemini API Client - Handles only the actual API calls to Google Gemini.
All business logic, prompt loading, and request construction is handled by AIService.
"""

from google import genai
from google.genai import types
from typing import Optional, Any, AsyncGenerator, Dict
from PIL import Image
import io
from app.services.ai_client_interface import AIClientInterface
from app.models.artwork import AIProvider
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Default model
DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"

class GeminiAPIClient(AIClientInterface):
    """Gemini-specific API client - only handles API calls"""

    def __init__(self):
        if not settings.gemini_api_key:
            raise ValueError("Gemini API key not configured")
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_name = settings.ai_model_override or DEFAULT_GEMINI_MODEL
        if settings.ai_model_override:
            logger.info(f"Gemini using model override: {self.model_name}")
        else:
            logger.info(f"Gemini using default model: {self.model_name}")

    def prepare_image(self, image_bytes: bytes) -> bytes:
        """Pass image bytes directly for Gemini"""
        return image_bytes

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Gemini API call with image and text"""
        logger.debug(f"Gemini call_with_image_and_text: {prompt[:100]}...")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[
                    prompt, 
                    types.Part.from_bytes(data=image_data, mime_type="image/jpeg")
                ],
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=response_schema
                )
            )

            # Handle None or empty response
            if response.text is None or response.text == "":
                logger.warning(f"Gemini returned None/empty response for image+text call")
                
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts_text = [part.text for part in candidate.content.parts if hasattr(part, 'text') and part.text]
                        if parts_text:
                            return "".join(parts_text)
                    
                    if hasattr(candidate, 'finish_reason'):
                        finish_reason = str(candidate.finish_reason)
                        if 'MAX_TOKENS' in finish_reason:
                            raise Exception(f"Gemini hit token limit. Current: {max_tokens}")
                        raise Exception(f"Gemini blocked response: {finish_reason}")

                raise Exception("Gemini returned empty response")

            return response.text
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Gemini API call with conversation history"""
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=messages,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json" if response_schema else None,
                    response_schema=response_schema
                )
            )

            if response.text is None or response.text == "":
                logger.warning(f"Gemini returned None/empty response for conversation call")
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts_text = [part.text for part in candidate.content.parts if hasattr(part, 'text') and part.text]
                        if parts_text:
                            return "".join(parts_text)
                raise Exception("Gemini returned empty response")

            return response.text
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Make Gemini API call with text only (no image)"""
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=response_schema
                )
            )

            if response.text is None or response.text == "":
                logger.warning(f"Gemini returned None/empty response for text-only call")
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts_text = [part.text for part in candidate.content.parts if hasattr(part, 'text') and part.text]
                        if parts_text:
                            return "".join(parts_text)
                raise Exception("Gemini returned empty response")

            return response.text
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    def build_conversation_messages(
        self,
        initial_prompt: str,
        image_data: Any,
        previous_messages: Optional[list],
        current_question: str
    ) -> list:
        """Build conversation messages in Gemini format with proper multi-turn structure"""
        contents = []
        
        # System instructions as first user message
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=initial_prompt)]
        ))

        if image_data:
            contents.append(types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text="Here is the artwork to analyze:"),
                    types.Part.from_bytes(data=image_data, mime_type="image/jpeg")
                ]
            ))
        
        # Previous conversation
        if previous_messages:
            for msg in previous_messages:
                role = "model" if msg.role == "assistant" else "user"
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.content)]
                ))
        
        # Current question
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=current_question)]
        ))
        
        return contents

    def get_provider_name(self) -> AIProvider:
        return AIProvider.GEMINI

    def get_model_name(self) -> str:
        return self.model_name

    async def stream_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream Gemini API call with image and text"""
        logger.debug(f"Gemini streaming call: {prompt[:100]}...")
        try:
            response = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=[
                    prompt, 
                    types.Part.from_bytes(data=image_data, mime_type="image/jpeg")
                ],
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=response_schema
                )
            )
            
            full_text_so_far = ""
            async for chunk in response:
                if chunk.text:
                    # Some versions of the SDK or specific models might return cumulative text in chunk.text
                    # We calculate the delta to ensure we only yield NEW text to the frontend
                    current_text = chunk.text
                    if current_text.startswith(full_text_so_far):
                        delta = current_text[len(full_text_so_far):]
                        full_text_so_far = current_text
                        if delta:
                            yield delta
                    else:
                        # If for some reason it's NOT cumulative, just yield it as is
                        yield current_text
                        full_text_so_far += current_text
        except Exception as e:
            raise Exception(f"Gemini streaming API error: {str(e)}")

    async def stream_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Stream Gemini API call with conversation history"""
        logger.debug(f"Gemini conversation streaming call")
        try:
            response = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=messages,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json" if response_schema else None,
                    response_schema=response_schema
                )
            )
            
            full_text_so_far = ""
            async for chunk in response:
                if chunk.text:
                    # Ensure we only yield the delta to prevent duplication in the frontend
                    current_text = chunk.text
                    if current_text.startswith(full_text_so_far):
                        delta = current_text[len(full_text_so_far):]
                        full_text_so_far = current_text
                        if delta:
                            yield delta
                    else:
                        yield current_text
                        full_text_so_far += current_text
        except Exception as e:
            raise Exception(f"Gemini conversation streaming API error: {str(e)}")
