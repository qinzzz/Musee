import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Type

from app.models.ai_job import AIJobType
from app.utils.prompt_loader import (
    COMPANION_IDENTITY,
    DEFAULT_IDENTITY,
    build_language_instruction,
    compose_prompt,
    get_movement_names,
    inject_identity,
    load_instruction,
)


UNRESOLVED_TEMPLATE_VARIABLE = re.compile(r"\{[A-Za-z_][A-Za-z0-9_]*\}")


@dataclass(frozen=True)
class SessionChatPromptContext:
    items: List[Mapping[str, Any]]
    retrieval_context: str = ""


@dataclass(frozen=True)
class SessionChatTurnContext:
    user_text: Optional[str]
    artwork_labels: Sequence[str]
    artwork_sources: Sequence[str]
    is_first_turn: bool


@dataclass(frozen=True)
class ArtworkIdentificationPromptContext:
    identity: str = "default"
    language: Optional[str] = None
    has_label_image: bool = False
    session_context: Optional[Mapping[str, Any]] = None
    vision_hint: Optional[str] = None
    artist_name: Optional[str] = None
    artwork_name: Optional[str] = None
    additional_clue: Optional[str] = None


@dataclass(frozen=True)
class ArtworkAnalysisPromptContext:
    metadata: Mapping[str, Optional[str]]


@dataclass(frozen=True)
class ArtworkSummaryPromptContext:
    artist_name: str
    artwork_name: str
    conversation_history: Sequence[Any]
    language: Optional[str] = None


@dataclass(frozen=True)
class SuggestTopicsPromptContext:
    artist_name: str
    artwork_name: str
    previous_insights: Sequence[str]
    identity: str = "default"
    language: Optional[str] = None


@dataclass(frozen=True)
class ArtworkFunFactsPromptContext:
    artist_name: str
    artwork_name: str
    language: Optional[str] = None


@dataclass(frozen=True)
class AestheticTermPromptContext:
    term: str


@dataclass(frozen=True)
class PromptDefinition:
    context_type: Type[Any]
    renderer: Callable[[Any], str]
    turn_context_type: Optional[Type[Any]] = None
    turn_renderer: Optional[Callable[[Any], str]] = None


def _render_session_chat_prompt(context: SessionChatPromptContext) -> str:
    metadata_lines: List[str] = []
    for index, item in enumerate(context.items[:10], start=1):
        bits: List[str] = []
        for key, prefix in (("artwork_name", ""), ("artist_name", "by "), ("date", ""), ("medium", "")):
            if item.get(key):
                bits.append(prefix + str(item[key]))
        if item.get("keywords"):
            bits.append(f"keywords: {', '.join(item['keywords'][:8])}")
        if item.get("description"):
            description = str(item["description"]).strip()
            bits.append(description if len(description) <= 280 else f"{description[:277]}...")
        if bits:
            metadata_lines.append(f"{index}. " + " | ".join(bits))

    metadata_context = ""
    if metadata_lines:
        metadata_context = (
            "\n\nCurrent artwork context:\n"
            + "\n".join(metadata_lines)
            + "\nUse this only as helpful context; prioritize what is visible in the image when image data is provided."
        )
    base_prompt = inject_identity(load_instruction("session_chat"), COMPANION_IDENTITY)
    return base_prompt + metadata_context + context.retrieval_context


def _render_session_chat_turn(context: SessionChatTurnContext) -> str:
    if context.user_text and context.user_text.strip():
        return context.user_text.strip()
    count = len(context.artwork_labels)
    if count == 0:
        raise ValueError("Session chat turn requires user text or at least one artwork")
    artwork_summary = context.artwork_labels[0] if count == 1 else f"{count} artworks: " + "; ".join(context.artwork_labels)
    source_summary = ", ".join(dict.fromkeys(context.artwork_sources)) or "session"
    action = f"The user added {artwork_summary} from {source_summary}. They did not include a written question. "
    if context.is_first_turn:
        return action + "This begins the session; briefly explain what stands out and where to look first."
    return action + "In 3–4 sentences, respond to the addition and connect it to the session so far."


def _render_artwork_identification_prompt(context: ArtworkIdentificationPromptContext) -> str:
    identity = DEFAULT_IDENTITY if context.identity == "default" else context.identity
    prompt = compose_prompt(
        identity,
        "artist_identification_with_analysis",
        language=context.language,
        movement_list=get_movement_names(),
    )

    hints = []
    if context.artist_name and context.artist_name.strip():
        hints.append(f"- Artist name hint: {context.artist_name.strip()}")
    if context.artwork_name and context.artwork_name.strip():
        hints.append(f"- Artwork title hint: {context.artwork_name.strip()}")
    if context.additional_clue and context.additional_clue.strip():
        hints.append(f"- Additional clue: {context.additional_clue.strip()}")
    if hints:
        prompt = (
            "User-provided identification hints:\n"
            + "\n".join(hints)
            + "\n\nUse these hints as guidance only, not as ground truth. The image remains the primary evidence. "
            "If the hints conflict with the visual evidence, prefer the visually supported answer. "
            "Do not force a match only because a hint was provided.\n\n"
            + prompt
        )

    if context.has_label_image:
        prompt = (
            "You will receive two images in this order:\n"
            "1. The artwork itself.\n"
            "2. A museum/gallery label for that artwork.\n\n"
            "Use the artwork image as the primary source of truth. Use the label image only as supporting evidence "
            "to refine the artist, title, date, medium, museum, and context. If the label is unreadable, partial, "
            "or conflicts with the artwork image, say so through cautious field choices and do not invent details.\n\n"
            + prompt
        )

    if context.session_context:
        session = context.session_context
        context_block = "\n\n### SESSION CONTEXT (MEMORY OF THIS VISIT)\n"
        if session.get("user_goal"):
            context_block += f"VISITOR'S GOAL FOR THIS SESSION: {session['user_goal']}\n\n"
        if session.get("narrative_summary"):
            context_block += f"ONGOING NARRATIVE: {session['narrative_summary']}\n\n"
        previous_artworks = session.get("previous_artworks", [])
        if previous_artworks:
            context_block += "PREVIOUS ARTWORKS SEEN IN THIS SESSION:\n"
            for index, artwork in enumerate(previous_artworks, start=1):
                context_block += f"{index}. '{artwork.get('title')}' by {artwork.get('artist')}\n"
                context_block += f"   ANALYSIS: {artwork.get('analysis')}\n"
                if artwork.get("tags"):
                    context_block += f"   TAGS: {', '.join(artwork['tags'])}\n"
                context_block += "\n"
        context_block += (
            "Use this context ONLY to help identify the artist and artwork title — they may be from the same "
            "exhibition or the same artist.\n"
        )
        prompt += context_block

    if context.vision_hint:
        prompt = (
            f"HINT — web image search result:\n{context.vision_hint}\n\n"
            "Use these as strong initial clues, but verify against the image.\n\n"
            + prompt
        )
    return prompt


def _render_artwork_analysis_prompt(context: ArtworkAnalysisPromptContext) -> str:
    metadata = context.metadata
    return load_instruction("artwork_analysis").format(
        artist=metadata.get("artist") or "unknown",
        title=metadata.get("title") or "unknown",
        year=metadata.get("year") or "unknown",
        medium=metadata.get("medium") or "unknown",
        context=metadata.get("context") or "none",
    )


def _render_artwork_summary_prompt(context: ArtworkSummaryPromptContext) -> str:
    language = build_language_instruction(context.language)
    language_suffix = f"\n\n{language}" if language else ""
    if context.conversation_history:
        conversation_text = "\n".join(
            f"{message.role}: {message.content}" for message in context.conversation_history
        )
        return f"""Based on this image and conversation about {context.artwork_name} by {context.artist_name}:

{conversation_text}

Generate ONE fun, engaging, memorable sentence that captures the essence of this artwork. Make it witty, intriguing, or surprising - something that would make someone want to learn more about this piece. Keep it under 20 words.

Return ONLY the one sentence, no quotes, no extra text.{language_suffix}"""
    return f"""Looking at this artwork {context.artwork_name} by {context.artist_name}, generate ONE fun, engaging, memorable sentence that captures its essence. Make it witty, intriguing, or surprising - something that would make someone want to learn more about this piece. Keep it under 20 words.

Return ONLY the one sentence, no quotes, no extra text.{language_suffix}"""


def _render_suggest_topics_prompt(context: SuggestTopicsPromptContext) -> str:
    identity = DEFAULT_IDENTITY if context.identity == "default" else context.identity
    return compose_prompt(
        identity,
        "suggest_topics",
        language=context.language,
        artist_name=context.artist_name,
        artwork_name=context.artwork_name,
        previous_insights="\n".join(f"- {insight}" for insight in context.previous_insights),
    )


def _render_artwork_fun_facts_prompt(context: ArtworkFunFactsPromptContext) -> str:
    return (
        inject_identity(load_instruction("fun_facts"), COMPANION_IDENTITY)
        .replace("{artist_name}", context.artist_name)
        .replace("{artwork_name}", context.artwork_name)
        .replace("{language_instruction}", build_language_instruction(context.language))
    )


def _render_aesthetic_term_prompt(context: AestheticTermPromptContext) -> str:
    return load_instruction("define_aesthetic_term") + f'\n\nTerm: "{context.term}"'


PROMPT_REGISTRY: Dict[AIJobType, PromptDefinition] = {
    AIJobType.AESTHETIC_TERM_DEFINITION: PromptDefinition(
        context_type=AestheticTermPromptContext,
        renderer=_render_aesthetic_term_prompt,
    ),
    AIJobType.ARTWORK_ANALYSIS: PromptDefinition(
        context_type=ArtworkAnalysisPromptContext,
        renderer=_render_artwork_analysis_prompt,
    ),
    AIJobType.ARTWORK_FUN_FACTS: PromptDefinition(
        context_type=ArtworkFunFactsPromptContext,
        renderer=_render_artwork_fun_facts_prompt,
    ),
    AIJobType.ARTWORK_IDENTIFICATION: PromptDefinition(
        context_type=ArtworkIdentificationPromptContext,
        renderer=_render_artwork_identification_prompt,
    ),
    AIJobType.ARTWORK_REIDENTIFICATION: PromptDefinition(
        context_type=ArtworkIdentificationPromptContext,
        renderer=_render_artwork_identification_prompt,
    ),
    AIJobType.ARTWORK_SUMMARY: PromptDefinition(
        context_type=ArtworkSummaryPromptContext,
        renderer=_render_artwork_summary_prompt,
    ),
    AIJobType.SESSION_CHAT: PromptDefinition(
        context_type=SessionChatPromptContext,
        renderer=_render_session_chat_prompt,
        turn_context_type=SessionChatTurnContext,
        turn_renderer=_render_session_chat_turn,
    ),
    AIJobType.SUGGEST_TOPICS: PromptDefinition(
        context_type=SuggestTopicsPromptContext,
        renderer=_render_suggest_topics_prompt,
    ),
}


def _validate_rendered_text(job_type: AIJobType, rendered: str, *, label: str) -> str:
    normalized = rendered.strip()
    if not normalized:
        raise ValueError(f"{label} for AI job type '{job_type.value}' rendered empty")
    unresolved = UNRESOLVED_TEMPLATE_VARIABLE.search(normalized)
    if unresolved:
        raise ValueError(f"{label} for AI job type '{job_type.value}' contains unresolved variable '{unresolved.group(0)}'")
    return normalized


def render_prompt(job_type: AIJobType, context: Any) -> str:
    """Render the system prompt owned by an existing AI job type."""
    definition = PROMPT_REGISTRY.get(job_type)
    if definition is None:
        raise ValueError(f"No prompt is registered for AI job type '{job_type.value}'")
    if not isinstance(context, definition.context_type):
        raise TypeError(f"Prompt context for '{job_type.value}' must be {definition.context_type.__name__}, got {type(context).__name__}")
    return _validate_rendered_text(job_type, definition.renderer(context), label="Prompt")


def render_prompt_turn(job_type: AIJobType, context: Any) -> str:
    """Render the current-turn text for a conversational AI job."""
    definition = PROMPT_REGISTRY.get(job_type)
    if definition is None:
        raise ValueError(f"No prompt is registered for AI job type '{job_type.value}'")
    if definition.turn_context_type is None or definition.turn_renderer is None:
        raise ValueError(f"AI job type '{job_type.value}' does not define a turn renderer")
    if not isinstance(context, definition.turn_context_type):
        raise TypeError(f"Turn context for '{job_type.value}' must be {definition.turn_context_type.__name__}, got {type(context).__name__}")
    return _validate_rendered_text(job_type, definition.turn_renderer(context), label="Turn")
