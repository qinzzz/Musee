import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Type

from app.models.ai_job import AIJobType
from app.utils.prompt_loader import get_session_chat_prompt


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
    return get_session_chat_prompt() + metadata_context + context.retrieval_context


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


PROMPT_REGISTRY: Dict[AIJobType, PromptDefinition] = {
    AIJobType.SESSION_CHAT: PromptDefinition(
        context_type=SessionChatPromptContext,
        renderer=_render_session_chat_prompt,
        turn_context_type=SessionChatTurnContext,
        turn_renderer=_render_session_chat_turn,
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
