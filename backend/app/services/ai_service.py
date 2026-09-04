"""
AI Service - Concrete implementation that orchestrates AI operations.
This service handles all common logic (prompt loading, image encoding, request construction)
and delegates only the actual API calls to provider-specific clients.
"""

from typing import Dict, Any, Optional, AsyncGenerator, List
import json
from app.models.ai_job import AIJobType
from app.models.artwork import AIProvider
from app.prompts.registry import (
    AestheticTermPromptContext,
    ArtworkFunFactsPromptContext,
    ArtworkIdentificationPromptContext,
    ArtworkSummaryPromptContext,
    SessionChatPromptContext,
    SuggestTopicsPromptContext,
    render_prompt,
)
from app.services.ai_client_interface import AIClientInterface, AIStreamChunk, AITextResult
from app.utils.prompt_loader import (
    build_language_instruction,
    get_explore_deepdive_prompt,
    get_explore_observation_prompt,
    get_explore_skill_select_prompt,
)
import anyio
from app.config.settings import settings
from app.utils.conversation_storage import ConversationMessage

# Schema for structured artwork analysis
ARTWORK_ANALYSIS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "artist": {"type": "STRING"},
        "title": {"type": "STRING"},
        "date": {"type": "STRING"},
        "medium": {"type": "STRING"},
        "movement": {"type": "STRING"},
        "period_bucket": {"type": "STRING"},
        "description": {"type": "STRING"},
        "tags": {
            "type": "ARRAY",
            "items": {"type": "STRING"}
        }
    },
    "required": ["artist", "title", "date", "medium", "movement", "period_bucket", "description", "tags"]
}


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
    def clean_summary_response(summary: str) -> str:
        """Clean summary response by removing quotes"""
        summary = summary.strip()
        summary = summary.strip('"').strip("'")
        return summary

    @staticmethod
    def build_session_chat_prompt(
        items: List[Dict[str, Any]],
        retrieval_context: str = "",
    ) -> str:
        """System instructions for session chat.

        Keep current artwork metadata in the system prompt so the first response
        after session creation has context even before history is reconstructed.
        """
        return render_prompt(
            AIJobType.SESSION_CHAT,
            SessionChatPromptContext(items=items, retrieval_context=retrieval_context),
        )

    @staticmethod
    def build_conversation_history(history: Optional[List[Dict[str, Any]]]) -> List[ConversationMessage]:
        """Normalize stored history into ConversationMessage objects."""
        if not history:
            return []

        normalized: List[ConversationMessage] = []
        for entry in history:
            if not entry:
                continue
            role = entry.get("role", "user")
            content = entry.get("content") or entry.get("text") or ""
            normalized.append(ConversationMessage(role=role, content=content))
        return normalized

    def prepare_image_batch(self, image_bytes_list: Optional[List[bytes]]) -> Optional[List[Any]]:
        """Prepare multiple images using the underlying client helper."""
        if not image_bytes_list:
            return None
        prepared: List[Any] = []
        for image_bytes in image_bytes_list:
            try:
                prepared.append(self.ai_client.prepare_image(image_bytes))
            except Exception:
                continue
        return prepared or None

    async def summarize_session_narrative(
        self,
        previous_narrative: Optional[str],
        new_artwork_data: Dict[str, Any],
        identity: str = "default",
        language: Optional[str] = None
    ) -> str:
        result = await self.summarize_session_narrative_result(
            previous_narrative=previous_narrative,
            new_artwork_data=new_artwork_data,
            identity=identity,
            language=language,
        )
        return result.text.strip()

    async def summarize_session_narrative_result(
        self,
        previous_narrative: Optional[str],
        new_artwork_data: Dict[str, Any],
        identity: str = "default",
        language: Optional[str] = None
    ) -> AITextResult:
        """
        Update the session's thematic narrative summary based on a new artwork.
        """
        language_text = build_language_instruction(language)
        language_instruction = f"\n\n{language_text}" if language_text else ""
        
        history_text = f"Previous Session Narrative: {previous_narrative if previous_narrative else 'Just started the tour.'}"
        current_art = f"Latest Artwork: '{new_artwork_data.get('title')}' by {new_artwork_data.get('artist')}. Description: {new_artwork_data.get('description')}"
        
        prompt = f"""You are a museum curator distilling the essence of an art tour into a single, evolving thematic narrative.

{history_text}

{current_art}

Update the "Session Narrative" to incorporate this latest piece. The narrative should be 2-3 sentences max and describe the thematic journey, stylistic shifts, or emerging connections across the session so far. Focus on the 'vibe' and intellectual thread.

Return ONLY the updated narrative text.{language_instruction}"""

        result = await self.ai_client.call_text_only_result(
            prompt=prompt,
            max_tokens=300,
            temperature=0.7
        )
        
        return AITextResult(
            text=result.text.strip(),
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )

    # Main service methods
    async def identify_artist(
        self,
        image_bytes: bytes,
        label_image_bytes: Optional[bytes] = None,
        identity: str = "default",
        language: Optional[str] = None,
        session_context: Optional[Dict[str, Any]] = None,
        vision_hint: Optional[str] = None,
        artist_name: Optional[str] = None,
        artwork_name: Optional[str] = None,
        additional_clue: Optional[str] = None,
    ) -> str:
        result = await self.identify_artist_result(
            image_bytes=image_bytes,
            label_image_bytes=label_image_bytes,
            identity=identity,
            language=language,
            session_context=session_context,
            vision_hint=vision_hint,
            artist_name=artist_name,
            artwork_name=artwork_name,
            additional_clue=additional_clue,
        )
        return result.text

    async def identify_artist_result(
        self,
        image_bytes: bytes,
        label_image_bytes: Optional[bytes] = None,
        identity: str = "default",
        language: Optional[str] = None,
        session_context: Optional[Dict[str, Any]] = None,
        vision_hint: Optional[str] = None,
        artist_name: Optional[str] = None,
        artwork_name: Optional[str] = None,
        additional_clue: Optional[str] = None,
    ) -> AITextResult:
        """
        Identify the artist and artwork details (non-streaming)

        Args:
            image_bytes: Raw image data
            identity: AI identity/persona to use
            language: Language code for response
            session_context: Optional context from previous session artworks
            vision_hint: Optional hint from Google Vision Web Detection

        Returns:
            str: Complete artist identification analysis
        """
        image_payloads = [image_bytes]
        if label_image_bytes:
            image_payloads.append(label_image_bytes)
        prepared_images = self.prepare_image_batch(image_payloads)
        image_data: Any
        if not prepared_images:
            image_data = self.ai_client.prepare_image(image_bytes)
        elif len(prepared_images) == 1:
            image_data = prepared_images[0]
        else:
            image_data = prepared_images

        prompt_job_type = (
            AIJobType.ARTWORK_REIDENTIFICATION
            if artist_name or artwork_name or additional_clue
            else AIJobType.ARTWORK_IDENTIFICATION
        )
        prompt = render_prompt(
            prompt_job_type,
            ArtworkIdentificationPromptContext(
                identity=identity,
                language=language,
                has_label_image=label_image_bytes is not None,
                session_context=session_context,
                vision_hint=vision_hint,
                artist_name=artist_name,
                artwork_name=artwork_name,
                additional_clue=additional_clue,
            ),
        )

        # Call API through client
        with anyio.fail_after(settings.ai_timeout):
            result = await self.ai_client.call_with_image_and_text_result(
                prompt=prompt,
                image_data=image_data,
                max_tokens=2000,
                temperature=0.1,
                response_schema=ARTWORK_ANALYSIS_SCHEMA
            )

        return result

    async def identify_artist_stream(
        self,
        image_bytes: bytes,
        label_image_bytes: Optional[bytes] = None,
        identity: str = "default",
        language: Optional[str] = None,
        session_context: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None,
        vision_hint: Optional[str] = None,
        artist_name: Optional[str] = None,
        artwork_name: Optional[str] = None,
        additional_clue: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream identify the artist and artwork details.
        session_context param retained for signature compatibility but no longer injected —
        contextual commentary belongs in the session chat, not the artwork card.
        """
        async for chunk in self.identify_artist_stream_result(
            image_bytes=image_bytes,
            label_image_bytes=label_image_bytes,
            identity=identity,
            language=language,
            session_context=session_context,
            reasoning_effort=reasoning_effort,
            vision_hint=vision_hint,
            artist_name=artist_name,
            artwork_name=artwork_name,
            additional_clue=additional_clue,
        ):
            if chunk.type == "text":
                yield chunk.text

    async def identify_artist_stream_result(
        self,
        image_bytes: bytes,
        label_image_bytes: Optional[bytes] = None,
        identity: str = "default",
        language: Optional[str] = None,
        session_context: Optional[Dict[str, Any]] = None,
        reasoning_effort: Optional[str] = None,
        vision_hint: Optional[str] = None,
        artist_name: Optional[str] = None,
        artwork_name: Optional[str] = None,
        additional_clue: Optional[str] = None,
    ) -> AsyncGenerator[AIStreamChunk, None]:
        """Stream identify the artist and artwork details with usage metadata events."""
        image_payloads = [image_bytes]
        if label_image_bytes:
            image_payloads.append(label_image_bytes)
        prepared_images = self.prepare_image_batch(image_payloads)
        image_data: Any
        if not prepared_images:
            image_data = self.ai_client.prepare_image(image_bytes)
        elif len(prepared_images) == 1:
            image_data = prepared_images[0]
        else:
            image_data = prepared_images

        prompt_job_type = (
            AIJobType.ARTWORK_REIDENTIFICATION
            if artist_name or artwork_name or additional_clue
            else AIJobType.ARTWORK_IDENTIFICATION
        )
        prompt = render_prompt(
            prompt_job_type,
            ArtworkIdentificationPromptContext(
                identity=identity,
                language=language,
                has_label_image=label_image_bytes is not None,
                vision_hint=vision_hint,
                artist_name=artist_name,
                artwork_name=artwork_name,
                additional_clue=additional_clue,
            ),
        )

        # Stream API through client
        with anyio.fail_after(settings.ai_timeout):
            async for chunk in self.ai_client.stream_with_image_and_text_result(
                prompt=prompt,
                image_data=image_data,
                max_tokens=2000,
                temperature=0.1,
                response_schema=ARTWORK_ANALYSIS_SCHEMA,
                reasoning_effort=reasoning_effort
            ):
                yield chunk

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
        prompt = render_prompt(
            AIJobType.SUGGEST_TOPICS,
            SuggestTopicsPromptContext(
                artist_name=artist_name,
                artwork_name=artwork_name,
                previous_insights=previous_insights,
                identity=identity,
                language=language,
            ),
        )

        # Call API through client (text-only)
        with anyio.fail_after(settings.ai_timeout):
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

        prompt = render_prompt(
            AIJobType.ARTWORK_SUMMARY,
            ArtworkSummaryPromptContext(
                artist_name=artist_name,
                artwork_name=artwork_name,
                conversation_history=conversation_history,
                language=language,
            ),
        )

        # Call API through client
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_with_image_and_text(
                prompt=prompt,
                image_data=image_data,
                max_tokens=100,  # Increased for Gemini compatibility (summary can be longer)
                temperature=0.9
            )

        # Clean and return
        return self.clean_summary_response(response)

    async def session_chat(
        self,
        items: list,
        history: list,
        new_message: str,
        image_bytes_list: List[bytes],
    ) -> str:
        result = await self.session_chat_result(
            items=items,
            history=history,
            new_message=new_message,
            image_bytes_list=image_bytes_list,
        )
        return result.text

    async def session_chat_result(
        self,
        items: list,
        history: list,
        new_message: str,
        image_bytes_list: List[bytes],
        retrieval_context: str = "",
    ) -> AITextResult:
        """
        Session chat: discuss a collection of works with the user.
        Implements provider-agnostic orchestration similar to other service methods.
        """
        prompt = self.build_session_chat_prompt(items, retrieval_context)
        conversation_history = self.build_conversation_history(history)
        image_data = None if history else self.prepare_image_batch(image_bytes_list)

        messages = self.ai_client.build_conversation_messages(
            initial_prompt=prompt,
            image_data=image_data,
            previous_messages=conversation_history,
            current_question=new_message,
        )

        with anyio.fail_after(settings.ai_timeout):
            return await self.ai_client.call_with_conversation_result(
                messages=messages,
                max_tokens=2048,
                temperature=0.7,
            )

    async def stream_session_chat(
        self,
        items: list,
        history: list,
        new_message: str,
        image_bytes_list: List[bytes],
        retrieval_context: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Stream session chat response token by token.
        Mirrors the non-streaming version but yields incremental chunks.
        """
        async for chunk in self.stream_session_chat_result(
            items=items,
            history=history,
            new_message=new_message,
            image_bytes_list=image_bytes_list,
            retrieval_context=retrieval_context,
        ):
            if chunk.type == "text":
                yield chunk.text

    async def stream_session_chat_result(
        self,
        items: list,
        history: list,
        new_message: str,
        image_bytes_list: List[bytes],
        retrieval_context: str = "",
    ) -> AsyncGenerator[AIStreamChunk, None]:
        """Stream session chat with usage metadata events when the provider exposes them."""
        prompt = self.build_session_chat_prompt(items, retrieval_context)
        conversation_history = self.build_conversation_history(history)
        image_data = None if history else self.prepare_image_batch(image_bytes_list)

        messages = self.ai_client.build_conversation_messages(
            initial_prompt=prompt,
            image_data=image_data,
            previous_messages=conversation_history,
            current_question=new_message,
        )

        with anyio.fail_after(settings.ai_timeout):
            async for chunk in self.ai_client.stream_with_conversation_result(
                messages=messages,
                max_tokens=2048,
                temperature=0.7,
            ):
                yield chunk

    # ── Interactive Explore mode ──────────────────────────────────────────────

    async def select_explore_skills(
        self,
        image_bytes: bytes,
        language: Optional[str] = None,
        artist_name: Optional[str] = None,
        artwork_name: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """Select 3 observation skills for the artwork from the fixed skill tree."""
        image_data = self.ai_client.prepare_image(image_bytes)
        prompt = get_explore_skill_select_prompt(
            language=language,
            artist_name=artist_name,
            artwork_name=artwork_name,
        )
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_with_image_and_text(
                prompt=prompt,
                image_data=image_data,
                max_tokens=400,
                temperature=0.7,
            )
        parsed = self.parse_json_response(response)
        return parsed.get("skills", [])

    async def get_skill_observation(
        self,
        image_bytes: bytes,
        skill_name: str,
        skill_desc: str,
        prev_observations: Optional[List[str]] = None,
        language: Optional[str] = None,
    ) -> str:
        """Return a single observation string for the given skill."""
        image_data = self.ai_client.prepare_image(image_bytes)
        prompt = get_explore_observation_prompt(
            skill_name=skill_name,
            skill_desc=skill_desc,
            prev_observations=prev_observations or [],
            language=language,
        )
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_with_image_and_text(
                prompt=prompt,
                image_data=image_data,
                max_tokens=200,
                temperature=0.8,
            )
        return response.strip()

    async def get_skill_deepdive(
        self,
        image_bytes: bytes,
        skill_name: str,
        skill_desc: str,
        language: Optional[str] = None,
    ) -> Dict[str, str]:
        """Return a deep-dive dict with 'text' and 'question' keys."""
        image_data = self.ai_client.prepare_image(image_bytes)
        prompt = get_explore_deepdive_prompt(
            skill_name=skill_name,
            skill_desc=skill_desc,
            language=language,
        )
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_with_image_and_text(
                prompt=prompt,
                image_data=image_data,
                max_tokens=400,
                temperature=0.7,
            )
        return self.parse_json_response(response)

    async def get_fun_facts(
        self,
        artist_name: str,
        artwork_name: str,
        language: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """Return 0-3 fun facts for the given artwork. Returns [] if AI has no reliable knowledge."""
        prompt = render_prompt(
            AIJobType.ARTWORK_FUN_FACTS,
            ArtworkFunFactsPromptContext(
                artist_name=artist_name,
                artwork_name=artwork_name,
                language=language,
            ),
        )
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_text_only(
                prompt=prompt,
                max_tokens=600,
                temperature=0.4,
            )
        parsed = self.parse_json_response(response)
        return parsed.get("points", [])

    async def define_aesthetic_term(self, tag: str) -> Dict[str, Any]:
        """Return a definition and external resonances for an aesthetic term."""
        prompt = render_prompt(
            AIJobType.AESTHETIC_TERM_DEFINITION,
            AestheticTermPromptContext(term=tag),
        )
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_text_only(
                prompt=prompt,
                max_tokens=300,
                temperature=0.7,
            )
        parsed = self.parse_json_response(response)
        return {
            "definition": parsed.get("definition", ""),
            "external_resonances": parsed.get("external_resonances", []),
        }

    def get_provider_name(self) -> AIProvider:
        """Return the AI provider name"""
        return self.ai_client.get_provider_name()

    def get_model_name(self) -> str:
        """Return the model name being used"""
        return self.ai_client.get_model_name()


class AIServiceFactory:
    """Factory for creating AI service instances"""

    _clients: Dict[AIProvider, AIClientInterface] = {}
    _fast_clients: Dict[AIProvider, AIClientInterface] = {}

    @classmethod
    def register_client(cls, provider: AIProvider, client: AIClientInterface):
        """Register the power AI client for a provider."""
        cls._clients[provider] = client

    @classmethod
    def register_fast_client(cls, provider: AIProvider, client: AIClientInterface):
        """Register a fast/cheap AI client for a provider (used by skills endpoints)."""
        cls._fast_clients[provider] = client

    @classmethod
    def get_service(cls, provider: AIProvider) -> AIService:
        """Get AI service using the power client."""
        if provider not in cls._clients:
            raise ValueError(f"AI client '{provider}' not registered")
        return AIService(cls._clients[provider])

    @classmethod
    def get_fast_service(cls, provider: AIProvider) -> AIService:
        """Get AI service using the fast client; falls back to power client if no fast client registered."""
        client = cls._fast_clients.get(provider) or cls._clients.get(provider)
        if not client:
            raise ValueError(f"AI client '{provider}' not registered")
        return AIService(client)

    @classmethod
    def get_available_providers(cls) -> list[AIProvider]:
        """Get list of available AI providers"""
        return list(cls._clients.keys())
