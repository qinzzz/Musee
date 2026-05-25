import os
import json
from pathlib import Path
from functools import lru_cache


PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
TONES_DIR = PROMPTS_DIR / "tones"
IDENTITIES_DIR = PROMPTS_DIR / "identities"
INSTRUCTIONS_DIR = PROMPTS_DIR / "instructions"
DATA_DIR = Path(__file__).parent.parent / "data"

# Legacy paths (for backward compatibility)
ARTIST_IDENTIFICATION_PROMPT_PATH = PROMPTS_DIR / "artist_identification.txt"
ARTWORK_ANALYSIS_PROMPT_PATH = PROMPTS_DIR / "artwork_analysis.txt"
ARTWORK_BITE_PROMPT_PATH = PROMPTS_DIR / "artwork_bite.txt"

DEFAULT_IDENTITY="museum_narrator"

def _load_prompt_file(file_path: Path) -> str:
    """
    Internal function to load a prompt file.

    Args:
        file_path: Path to the prompt file

    Returns:
        str: The prompt text

    Raises:
        FileNotFoundError: If the prompt file doesn't exist
        IOError: If there's an error reading the file
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Prompt file not found at: {file_path}")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception as e:
        raise IOError(f"Error reading prompt file: {str(e)}")


@lru_cache(maxsize=1)
def load_artist_identification_prompt() -> str:
    """
    Load the artist identification prompt from file.

    Returns:
        str: The prompt text for artist identification
    """
    return _load_prompt_file(ARTIST_IDENTIFICATION_PROMPT_PATH)


@lru_cache(maxsize=1)
def load_artwork_analysis_base_prompt() -> str:
    """
    Load the base artwork analysis prompt from file.

    Returns:
        str: The base prompt text for artwork analysis
    """
    return _load_prompt_file(ARTWORK_ANALYSIS_PROMPT_PATH)


@lru_cache(maxsize=1)
def load_artwork_bite_prompt() -> str:
    """
    Load the artwork bite prompt from file.

    Returns:
        str: The prompt text for artwork bite
    """
    return _load_prompt_file(ARTWORK_BITE_PROMPT_PATH)


def get_artwork_bite_prompt(artist_name: str, artwork_name: str = "Unknown") -> str:
    """
    Get the artwork bite prompt with artist and artwork names filled in.

    Args:
        artist_name: Name of the artist
        artwork_name: Name of the artwork (optional, defaults to "Unknown")
        topic: Optional topic to focus on (e.g., "technique", "historical context", "symbolism")
        previous_insights: List of previous insights shared (to avoid repetition)
                          Note: Only used for Gemini - OpenAI/Claude use message history

    Returns:
        str: The complete prompt text with artist and artwork names
    """
    prompt = load_artwork_bite_prompt()
    prompt = prompt.replace("{artist_name}", artist_name)
    prompt = prompt.replace("{artwork_name}", artwork_name)

    return prompt


# ===== New composable prompt system =====

def get_available_identities() -> list[str]:
    """
    Get list of available identity names.

    Returns:
        list[str]: List of available identity names (without .txt extension)
    """
    if not IDENTITIES_DIR.exists():
        return []

    identities = []
    for file_path in IDENTITIES_DIR.glob("*.txt"):
        identities.append(file_path.stem)  # Get filename without extension

    return sorted(identities)


@lru_cache(maxsize=10)
def load_identity(identity_name: str) -> str:
    """
    Load an identity prompt from the identities directory.

    Args:
        identity_name: Name of the identity file (without .txt extension)

    Returns:
        str: The identity prompt text

    Raises:
        ValueError: If the identity is not available
    """
    available = get_available_identities()

    if identity_name not in available:
        available_str = ", ".join(available)
        raise ValueError(
            f"Identity '{identity_name}' is not available. "
            f"Please choose from: {available_str}"
        )

    identity_path = IDENTITIES_DIR / f"{identity_name}.txt"
    return _load_prompt_file(identity_path)


def get_available_instructions() -> list[str]:
    """
    Get list of available instruction names.

    Returns:
        list[str]: List of available instruction names (without .txt extension)
    """
    if not INSTRUCTIONS_DIR.exists():
        return []

    instructions = []
    for file_path in INSTRUCTIONS_DIR.glob("*.txt"):
        instructions.append(file_path.stem)  # Get filename without extension

    return sorted(instructions)


@lru_cache(maxsize=10)
def load_instruction(instruction_name: str) -> str:
    """
    Load an instruction prompt from the instructions directory.

    Args:
        instruction_name: Name of the instruction file (without .txt extension)

    Returns:
        str: The instruction prompt text

    Raises:
        ValueError: If the instruction is not available
    """
    available = get_available_instructions()

    if instruction_name not in available:
        available_str = ", ".join(available)
        raise ValueError(
            f"Instruction '{instruction_name}' is not available. "
            f"Please choose from: {available_str}"
        )

    instruction_path = INSTRUCTIONS_DIR / f"{instruction_name}.txt"
    return _load_prompt_file(instruction_path)


def compose_prompt(identity_name: str, instruction_name: str, language: str = None, **kwargs) -> str:
    """
    Compose a complete prompt from an identity and instruction.

    Args:
        identity_name: Name of the identity file (without .txt extension)
        instruction_name: Name of the instruction file (without .txt extension)
        language: Language code for response (e.g., "en", "es", "fr", "zh") - optional
        **kwargs: Variable replacements for placeholders in the prompts

    Returns:
        str: The composed prompt with identity and instructions
    """
    identity = load_identity(identity_name)
    instruction = load_instruction(instruction_name)

    # Compose with "# Identity" header
    if identity != "":
        prompt = f"""# Identity
        {identity}
        
        {instruction}"""
    else:
        prompt = instruction

    # Replace any placeholders
    for key, value in kwargs.items():
        placeholder = "{" + key + "}"
        prompt = prompt.replace(placeholder, str(value))
    
    lang_instr = _build_language_instruction(language)
    if lang_instr:
        prompt += f"\n\n{lang_instr}"

    return prompt


@lru_cache(maxsize=1)
def load_exhibition_chat_prompt() -> str:
    """
    Load the exhibition chat system prompt template from file.

    Returns:
        str: The prompt template text (contains {collection_summary} placeholder)
    """
    return _load_prompt_file(INSTRUCTIONS_DIR / "exhibition_chat.txt")


def get_exhibition_chat_prompt(collection_summary: str) -> str:
    """
    Get the exhibition chat system prompt with collection summary injected.

    Args:
        collection_summary: Formatted string of the user's collection keywords

    Returns:
        str: The complete system prompt for exhibition chat
    """
    template = load_exhibition_chat_prompt()
    return template.replace("{collection_summary}", collection_summary)


def get_artist_identification_prompt_v2(identity: str = "default", language: str = None) -> str:
    """
    Get the artist identification prompt using composable system.

    Args:
        identity: Identity to use ("default" maps to "museum_narrator")
        language: Language code for response (e.g., "en", "es", "fr", "zh") - optional

    Returns:
        str: The complete prompt for artist identification
    """
    # Map "default" to the appropriate identity for this task
    if identity == "default":
        identity = DEFAULT_IDENTITY
    return compose_prompt(
        identity,
        "artist_identification_with_analysis",
        language=language,
        movement_list=get_movement_names()
    )


def get_artwork_bite_prompt_v2(
    artist_name: str,
    artwork_name: str = "Unknown",
    identity: str = "default",
    language: str = None
) -> str:
    """
    Get the artwork bite prompt using composable system.

    Args:
        artist_name: Name of the artist
        artwork_name: Name of the artwork (optional, defaults to "Unknown")
        identity: Identity to use ("default" maps to "art_historian")
        language: Language code for response (e.g., "en", "es", "fr", "zh") - optional

    Returns:
        str: The complete prompt for artwork bite
    """
    # Map "default" to the appropriate identity for this task
    if identity == "default":
        identity = DEFAULT_IDENTITY
    return compose_prompt(
        identity,
        "artwork_bite",
        language=language,
        artist_name=artist_name,
        artwork_name=artwork_name
    )


def get_suggest_topics_prompt_v2(
    artist_name: str,
    artwork_name: str,
    previous_insights: list,
    identity: str = "default",
    language: str = None
) -> str:
    """
    Get the suggest topics prompt using composable system.

    Args:
        artist_name: Name of the artist
        artwork_name: Name of the artwork
        previous_insights: List of previous insights shared
        identity: Identity to use ("default" maps to "art_historian")
        language: Language code for response (e.g., "en", "es", "fr", "zh") - optional

    Returns:
        str: The complete prompt for suggesting topics
    """
    # Map "default" to the appropriate identity for this task
    if identity == "default":
        identity = DEFAULT_IDENTITY

    # Format previous insights as bullet points
    insights_text = "\n".join([f"- {insight}" for insight in previous_insights])

    return compose_prompt(
        identity,
        "suggest_topics",
        language=language,
        artist_name=artist_name,
        artwork_name=artwork_name,
        previous_insights=insights_text
    )


# ===== Interactive Explore mode prompts =====

@lru_cache(maxsize=1)
def _load_explore_skill_select_template() -> str:
    return _load_prompt_file(INSTRUCTIONS_DIR / "explore_skill_select.txt")

@lru_cache(maxsize=1)
def _load_explore_observation_template() -> str:
    return _load_prompt_file(INSTRUCTIONS_DIR / "explore_observation.txt")

@lru_cache(maxsize=1)
def _load_explore_deepdive_template() -> str:
    return _load_prompt_file(INSTRUCTIONS_DIR / "explore_deepdive.txt")


def _build_language_instruction(language) -> str:
    if not language:
        return ""
    language_map = {
        "en": "English", "es": "Spanish", "fr": "French", "de": "German",
        "it": "Italian", "pt": "Portuguese", "zh": "Chinese", "ja": "Japanese",
        "ko": "Korean", "ru": "Russian", "ar": "Arabic", "hi": "Hindi"
    }
    name = language_map.get(language.lower(), language)
    return f"IMPORTANT: Respond in {name} ({language}). All your output should be in {name}."


def get_explore_skill_select_prompt(language=None, artist_name=None, artwork_name=None) -> str:
    template = _load_explore_skill_select_template()
    lang_instr = _build_language_instruction(language)
    if artist_name:
        ctx = f'Artwork context: "{artwork_name or "Unknown"}" by {artist_name}. Use this to select the most relevant and insightful skills.\n'
    else:
        ctx = ""
    return (template
        .replace("{artwork_context}", ctx)
        .replace("{language_instruction}", lang_instr))


def get_explore_observation_prompt(
    skill_name: str,
    skill_desc: str,
    prev_observations=None,
    language=None
) -> str:
    template = _load_explore_observation_template()
    lang_instr = _build_language_instruction(language)
    if prev_observations:
        prev_text = "Already shared with the visitor (do not repeat or rephrase):\n" + "\n".join(f"- {o}" for o in prev_observations)
    else:
        prev_text = ""
    return (
        template
        .replace("{skill_name}", skill_name)
        .replace("{skill_desc}", skill_desc)
        .replace("{prev_observations_instruction}", prev_text)
        .replace("{language_instruction}", lang_instr)
    )


def get_explore_deepdive_prompt(
    skill_name: str,
    skill_desc: str,
    language=None
) -> str:
    template = _load_explore_deepdive_template()
    lang_instr = _build_language_instruction(language)
    return (
        template
        .replace("{skill_name}", skill_name)
        .replace("{skill_desc}", skill_desc)
        .replace("{language_instruction}", lang_instr)
    )


@lru_cache(maxsize=1)
def _load_insights_template() -> str:
    return _load_prompt_file(INSTRUCTIONS_DIR / "insights.txt")


def get_insights_prompt(artist_name: str, artwork_name: str, language: str = None) -> str:
    template = _load_insights_template()
    lang_instr = _build_language_instruction(language)
    return (template
        .replace("{artist_name}", artist_name)
        .replace("{artwork_name}", artwork_name)
        .replace("{language_instruction}", lang_instr))


@lru_cache(maxsize=1)
def _load_define_aesthetic_term_template() -> str:
    return _load_prompt("instructions/define_aesthetic_term.txt")


def get_define_aesthetic_term_prompt(tag: str) -> str:
    template = _load_define_aesthetic_term_template()
    return template + f'\n\nTerm: "{tag}"'


# ===== Art Movement taxonomy =====

@lru_cache(maxsize=1)
def load_movements() -> list:
    """Load the canonical art movement taxonomy from data/movements.json."""
    with open(DATA_DIR / "movements.json", "r") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def get_movement_names() -> str:
    """Return a comma-separated string of all canonical movement names for prompt injection."""
    movements = load_movements()
    return ", ".join(m["name"] for m in movements)


def get_movement_by_name(name: str) -> dict | None:
    """Look up a movement entry by name (case-insensitive)."""
    movements = load_movements()
    name_lower = name.lower()
    for m in movements:
        if m["name"].lower() == name_lower:
            return m
    return None
