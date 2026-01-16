"""
Gemini API Client - Handles only the actual API calls to Google Gemini.
All business logic, prompt loading, and request construction is handled by AIService.
"""

from google import genai
from google.genai import types
from typing import Optional, Any
from PIL import Image
import io
from app.services.ai_client_interface import AIClientInterface
from app.models.artwork import AIProvider
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

# Default model
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

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

    def prepare_image(self, image_bytes: bytes) -> Image.Image:
        """Prepare image as PIL Image for Gemini"""
        return Image.open(io.BytesIO(image_bytes))

    async def call_with_image_and_text(
        self,
        prompt: str,
        image_data: Any,
        max_tokens: int,
        temperature: float
    ) -> str:
        """Make Gemini API call with image and text"""
        logger.debug(f"geminie call_with_image_and_text: {prompt}")

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[prompt, image_data],
                config=types.GenerateContentConfig(
                    temperature=temperature
                )
            )

            # Handle None or empty response
            if response.text is None or response.text == "":
                logger.warning(f"Gemini returned None/empty response for image+text call")

                # Try to extract text from candidates
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]

                    # Try to get text from content parts
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts_text = []
                        for part in candidate.content.parts:
                            if hasattr(part, 'text') and part.text:
                                parts_text.append(part.text)
                        if parts_text:
                            return "".join(parts_text)

                    # Check finish reason
                    if hasattr(candidate, 'finish_reason'):
                        finish_reason = str(candidate.finish_reason)
                        if 'MAX_TOKENS' in finish_reason:
                            raise Exception(f"Gemini hit token limit. Try with higher max_tokens. Current: {max_tokens}")
                        raise Exception(f"Gemini blocked response: {finish_reason}")

                raise Exception("Gemini returned empty response (possibly blocked by safety filters)")

            return response.text
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def call_with_conversation(
        self,
        messages: list,
        max_tokens: int,
        temperature: float
    ) -> str:
        """Make Gemini API call with conversation history"""
        # Gemini expects a single prompt with context
        # messages list contains: [prompt_with_image, previous_messages..., current_question]
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=messages,  # Pass the prepared content list
                config=types.GenerateContentConfig(
                    temperature=temperature
                )
            )

            # Handle None or empty response
            if response.text is None or response.text == "":
                logger.warning(f"Gemini returned None/empty response for conversation call")

                # Try to extract text from candidates
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]

                    # Try to get text from content parts
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts_text = []
                        for part in candidate.content.parts:
                            if hasattr(part, 'text') and part.text:
                                parts_text.append(part.text)
                        if parts_text:
                            return "".join(parts_text)

                    # Check finish reason
                    if hasattr(candidate, 'finish_reason'):
                        finish_reason = str(candidate.finish_reason)
                        if 'MAX_TOKENS' in finish_reason:
                            raise Exception(f"Gemini hit token limit. Try with higher max_tokens. Current: {max_tokens}")
                        raise Exception(f"Gemini blocked response: {finish_reason}")

                raise Exception("Gemini returned empty response (possibly blocked by safety filters)")

            return response.text
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")

    async def call_text_only(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float = 0.7
    ) -> str:
        """Make Gemini API call with text only (no image)"""
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature
                )
            )

            # Handle None or empty response
            if response.text is None or response.text == "":
                logger.warning(f"Gemini returned None/empty response for text-only call")

                # Try to extract text from candidates
                if hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]

                    # Try to get text from content parts
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        parts_text = []
                        for part in candidate.content.parts:
                            if hasattr(part, 'text') and part.text:
                                parts_text.append(part.text)
                        if parts_text:
                            return "".join(parts_text)

                    # Check finish reason
                    if hasattr(candidate, 'finish_reason'):
                        finish_reason = str(candidate.finish_reason)
                        if 'MAX_TOKENS' in finish_reason:
                            raise Exception(f"Gemini hit token limit. Try with higher max_tokens. Current: {max_tokens}")
                        raise Exception(f"Gemini blocked response: {finish_reason}")

                raise Exception("Gemini returned empty response (possibly blocked by safety filters)")

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
        """Build conversation messages in Gemini format with proper multi-turn structure
        
        Note: Gemini only supports 'user' and 'model' roles, no 'system' role.
        We structure the conversation to put system instructions first.
        """
        contents = []
        
        # Gemini doesn't have a system role, so we use an initial user/model exchange
        # to set the context and instructions
        contents.append({
            "role": "user",
            "parts": [
                {"text": initial_prompt}
            ]
        })
        
        # Now add the image with the actual analysis request
        # Convert PIL Image to base64 for Gemini's multi-turn format
        import base64
        import io
        
        # Convert PIL Image to bytes
        img_byte_arr = io.BytesIO()
        image_data.save(img_byte_arr, format='JPEG')
        img_byte_arr = img_byte_arr.getvalue()
        
        # Encode to base64
        img_base64 = base64.b64encode(img_byte_arr).decode('utf-8')
        
        contents.append({
            "role": "user",
            "parts": [
                {"text": "Here is the artwork to analyze:"},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": img_base64
                    }
                }
            ]
        })
        
        # Add previous conversation messages if available
        if previous_messages:
            for msg in previous_messages:
                # Map roles: "user" stays "user", "assistant" becomes "model" for Gemini
                role = "model" if msg.role == "assistant" else "user"
                contents.append({
                    "role": role,
                    "parts": [{"text": msg.content}]
                })
        
        # Add current question as the latest user message
        contents.append({
            "role": "user",
            "parts": [{"text": current_question}]
        })
        
        return contents

    def get_provider_name(self) -> AIProvider:
        return AIProvider.GEMINI

    def get_model_name(self) -> str:
        return self.model_name
