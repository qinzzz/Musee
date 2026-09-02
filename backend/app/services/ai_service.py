"""
AI Service - Concrete implementation that orchestrates AI operations.
This service handles all common logic (prompt loading, image encoding, request construction)
and delegates only the actual API calls to provider-specific clients.
"""

from typing import Dict, Any, Optional, AsyncGenerator, List
import json
from app.models.artwork import AIProvider
from app.utils.prompt_loader import (
    get_artist_identification_prompt_v2,
    get_artwork_bite_prompt_v2,
    get_suggest_topics_prompt_v2,
    get_session_chat_prompt,
    get_explore_skill_select_prompt,
    get_explore_observation_prompt,
    get_explore_deepdive_prompt,
    get_define_aesthetic_term_prompt,
    get_fun_facts_prompt,
    get_artist_bio_prompt,
)
from app.services.ai_client_interface import AIClientInterface, AIStreamChunk, AITextResult
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

    @staticmethod
    def inject_session_context(prompt: str, session_context: Dict[str, Any]) -> str:
        """Inject session context into the prompt"""
        previous_artworks = session_context.get("previous_artworks", [])
        narrative_summary = session_context.get("narrative_summary")

        user_goal = session_context.get("user_goal")

        context_block = "\n\n### SESSION CONTEXT (MEMORY OF THIS VISIT)\n"

        if user_goal:
            context_block += f"VISITOR'S GOAL FOR THIS SESSION: {user_goal}\n\n"

        if narrative_summary:
            context_block += f"ONGOING NARRATIVE: {narrative_summary}\n\n"

        if previous_artworks:
            context_block += "PREVIOUS ARTWORKS SEEN IN THIS SESSION:\n"
            for i, art in enumerate(previous_artworks):
                context_block += f"{i+1}. '{art.get('title')}' by {art.get('artist')}\n"
                context_block += f"   ANALYSIS: {art.get('analysis')}\n"
                if art.get("tags"):
                    context_block += f"   TAGS: {', '.join(art.get('tags'))}\n"
                context_block += "\n"
        
        context_block += "Use this context ONLY to help identify the artist and artwork title — they may be from the same exhibition or the same artist.\n"
        
        # Append context to the prompt
        return prompt + context_block

    @staticmethod
    def build_session_chat_prompt(
        items: List[Dict[str, Any]],
        retrieval_context: str = "",
    ) -> str:
        """System instructions for session chat.

        Keep current artwork metadata in the system prompt so the first response
        after session creation has context even before history is reconstructed.
        """
        metadata_lines: List[str] = []
        for index, item in enumerate(items[:10], start=1):
            bits: List[str] = []
            artwork_name = item.get("artwork_name")
            artist_name = item.get("artist_name")
            if artwork_name:
                bits.append(str(artwork_name))
            if artist_name:
                bits.append(f"by {artist_name}")
            if item.get("date"):
                bits.append(str(item["date"]))
            if item.get("medium"):
                bits.append(str(item["medium"]))
            if item.get("keywords"):
                bits.append(f"keywords: {', '.join(item['keywords'][:8])}")
            if item.get("description"):
                description = str(item["description"]).strip()
                if len(description) > 280:
                    description = f"{description[:277]}..."
                bits.append(description)
            if bits:
                metadata_lines.append(f"{index}. " + " | ".join(bits))

        metadata_context = ""
        if metadata_lines:
            metadata_context = (
                "\n\nCurrent artwork context:\n"
                + "\n".join(metadata_lines)
                + "\nUse this only as helpful context; prioritize what is visible in the image when image data is provided."
            )

        return get_session_chat_prompt("") + metadata_context + retrieval_context

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

    @staticmethod
    def inject_supporting_label_context(prompt: str, has_label_image: bool) -> str:
        """Explain the multi-image contract when an artwork label is present."""
        if not has_label_image:
            return prompt

        return (
            "You will receive two images in this order:\n"
            "1. The artwork itself.\n"
            "2. A museum/gallery label for that artwork.\n\n"
            "Use the artwork image as the primary source of truth. Use the label image only as supporting evidence "
            "to refine the artist, title, date, medium, museum, and context. If the label is unreadable, partial, "
            "or conflicts with the artwork image, say so through cautious field choices and do not invent details.\n\n"
            f"{prompt}"
        )

    @staticmethod
    def inject_identification_hints(
        prompt: str,
        artist_name: Optional[str] = None,
        artwork_name: Optional[str] = None,
        additional_clue: Optional[str] = None,
    ) -> str:
        """Append user-provided identify-again hints as advisory evidence, not overrides."""
        hints = []
        if artist_name and artist_name.strip():
            hints.append(f"- Artist name hint: {artist_name.strip()}")
        if artwork_name and artwork_name.strip():
            hints.append(f"- Artwork title hint: {artwork_name.strip()}")
        if additional_clue and additional_clue.strip():
            hints.append(f"- Additional clue: {additional_clue.strip()}")

        if not hints:
            return prompt

        hint_block = "\n".join(hints)
        return (
            "User-provided identification hints:\n"
            f"{hint_block}\n\n"
            "Use these hints as guidance only, not as ground truth. The image remains the primary evidence. "
            "If the hints conflict with the visual evidence, prefer the visually supported answer. "
            "Do not force a match only because a hint was provided.\n\n"
            f"{prompt}"
        )

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
        language_instruction = self.build_language_instruction(language)
        
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

        # Load prompt
        prompt = get_artist_identification_prompt_v2(identity, language=language)
        prompt = self.inject_identification_hints(
            prompt,
            artist_name=artist_name,
            artwork_name=artwork_name,
            additional_clue=additional_clue,
        )

        prompt = self.inject_supporting_label_context(prompt, has_label_image=label_image_bytes is not None)

        if session_context:
            prompt = self.inject_session_context(prompt, session_context)

        # Prepend Vision hint when available
        if vision_hint:
            prompt = f"HINT — web image search result:\n{vision_hint}\n\nUse these as strong initial clues, but verify against the image.\n\n{prompt}"

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

        # Load prompt
        prompt = get_artist_identification_prompt_v2(identity, language=language)
        prompt = self.inject_identification_hints(
            prompt,
            artist_name=artist_name,
            artwork_name=artwork_name,
            additional_clue=additional_clue,
        )

        prompt = self.inject_supporting_label_context(prompt, has_label_image=label_image_bytes is not None)

        # Prepend Vision hint when available
        if vision_hint:
            prompt = f"HINT — web image search result:\n{vision_hint}\n\nUse these as strong initial clues, but verify against the image.\n\n{prompt}"

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

    async def get_artwork_bite(
        self,
        image_bytes: bytes,
        artist_name: str,
        artwork_name: str = "Unknown",
        followup_question: str = None,
        previous_messages: list = None,
        identity: str = "default",
        language: Optional[str] = None,
        session_context: Optional[Dict[str, Any]] = None
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
            session_context: Optional context from previous session artworks

        Returns:
            str: Concise interesting fact about the artwork
        """
        # Prepare image in provider-specific format
        image_data = self.ai_client.prepare_image(image_bytes)

        # Load base prompt
        prompt = get_artwork_bite_prompt_v2(artist_name, artwork_name, identity, language=language)

        # Inject session context if provided
        if session_context:
            prompt = self.inject_session_context(prompt, session_context)

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
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_with_conversation(
                messages=messages,
                max_tokens=200,
                temperature=0.8
            )

        return response

    async def get_artwork_bite_stream(
        self,
        image_bytes: bytes,
        artist_name: str,
        artwork_name: str = "Unknown",
        followup_question: str = None,
        previous_messages: list = None,
        identity: str = "default",
        language: Optional[str] = None,
        session_context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream interesting information about the artwork

        Args:
            image_bytes: Raw image data
            artist_name: Name of the artist
            artwork_name: Name of the artwork
            followup_question: Optional followup question
            previous_messages: List of previous ConversationMessage objects
            identity: AI identity/persona to use
            language: Language code for response
            session_context: Optional context from previous session artworks

        Yields:
            str: Text chunks as they arrive from the API
        """
        # Prepare image in provider-specific format
        image_data = self.ai_client.prepare_image(image_bytes)

        # Load base prompt
        from app.utils.prompt_loader import get_artwork_bite_prompt_v2
        prompt = get_artwork_bite_prompt_v2(artist_name, artwork_name, identity, language=language)

        # Inject session context if provided
        if session_context:
            prompt = self.inject_session_context(prompt, session_context)

        # Determine current question
        current_question = "Tell me more about this artwork." if not followup_question else followup_question

        # Build conversation messages in provider-specific format
        messages = self.ai_client.build_conversation_messages(
            initial_prompt=prompt,
            image_data=image_data,
            previous_messages=previous_messages,
            current_question=current_question
        )

        # Stream API through client
        with anyio.fail_after(settings.ai_timeout):
            async for chunk in self.ai_client.stream_with_conversation(
                messages=messages,
                max_tokens=200,
                temperature=0.8
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
        # Load prompt
        prompt = get_suggest_topics_prompt_v2(
            artist_name=artist_name,
            artwork_name=artwork_name,
            previous_insights=previous_insights,
            identity=identity,
            language=language
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

        # Build summary prompt
        prompt = self.build_summary_prompt(artist_name, artwork_name, conversation_history, language)

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

    # Backward-compat aliases for older call sites.
    build_visit_prompt = build_session_chat_prompt
    visit_chat = session_chat
    visit_chat_stream = stream_session_chat

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
        prompt = get_explore_skill_select_prompt(language=language, artist_name=artist_name, artwork_name=artwork_name)
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
        prompt = get_fun_facts_prompt(artist_name=artist_name, artwork_name=artwork_name, language=language)
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_text_only(
                prompt=prompt,
                max_tokens=600,
                temperature=0.4,
            )
        parsed = self.parse_json_response(response)
        return parsed.get("points", [])

    async def get_artist_bio(
        self,
        artist_name: str,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return biographical data for the given artist. Returns empty dict on failure."""
        prompt = get_artist_bio_prompt(artist_name=artist_name, language=language)
        with anyio.fail_after(settings.ai_timeout):
            response = await self.ai_client.call_text_only(
                prompt=prompt,
                max_tokens=400,
                temperature=0.2,
            )
        parsed = self.parse_json_response(response)
        return {
            "bio": parsed.get("bio"),
            "nationality": parsed.get("nationality"),
            "birth_year": parsed.get("birth_year"),
            "death_year": parsed.get("death_year"),
            "movements": parsed.get("movements") or [],
        }

    async def define_aesthetic_term(self, tag: str) -> Dict[str, Any]:
        """Return a definition and external resonances for an aesthetic term."""
        prompt = get_define_aesthetic_term_prompt(tag)
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
