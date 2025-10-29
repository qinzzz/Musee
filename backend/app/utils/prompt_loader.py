import os
from pathlib import Path
from functools import lru_cache
from app.models.artwork import ToneType


PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
TONES_DIR = PROMPTS_DIR / "tones"
IDENTITIES_DIR = PROMPTS_DIR / "identities"
INSTRUCTIONS_DIR = PROMPTS_DIR / "instructions"

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


@lru_cache(maxsize=5)
def load_tone_prompt(tone: ToneType) -> str:
    """
    Load a tone-specific prompt from file.

    Args:
        tone: The tone type to load

    Returns:
        str: The tone-specific prompt text
    """
    tone_file_path = TONES_DIR / f"{tone.value}.txt"
    return _load_prompt_file(tone_file_path)


def get_artist_identification_prompt() -> str:
    """
    Get the artist identification prompt (with caching).

    Returns:
        str: The prompt text for artist identification
    """
    return load_artist_identification_prompt()


def get_artwork_analysis_prompt(tone: ToneType) -> str:
    """
    Get the complete artwork analysis prompt with tone instruction.

    Args:
        tone: The tone type for the analysis

    Returns:
        str: The complete prompt text with tone instruction
    """
    base_prompt = load_artwork_analysis_base_prompt()
    tone_instruction = load_tone_prompt(tone)

    # Replace the {tone_instruction} placeholder
    return base_prompt.replace("{tone_instruction}", tone_instruction)


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


def compose_prompt(identity_name: str, instruction_name: str, **kwargs) -> str:
    """
    Compose a complete prompt from an identity and instruction.

    Args:
        identity_name: Name of the identity file (without .txt extension)
        instruction_name: Name of the instruction file (without .txt extension)
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

    return prompt


def get_artist_identification_prompt_v2(identity: str = "default") -> str:
    """
    Get the artist identification prompt using composable system.

    Args:
        identity: Identity to use ("default" maps to "museum_narrator")

    Returns:
        str: The complete prompt for artist identification
    """
    # Map "default" to the appropriate identity for this task
    if identity == "default":
        identity = DEFAULT_IDENTITY
    return compose_prompt(identity, "artist_identification")


def get_artwork_bite_prompt_v2(
    artist_name: str,
    artwork_name: str = "Unknown",
    identity: str = "default"
) -> str:
    """
    Get the artwork bite prompt using composable system.

    Args:
        artist_name: Name of the artist
        artwork_name: Name of the artwork (optional, defaults to "Unknown")
        identity: Identity to use ("default" maps to "art_historian")

    Returns:
        str: The complete prompt for artwork bite
    """
    # Map "default" to the appropriate identity for this task
    if identity == "default":
        identity = DEFAULT_IDENTITY
    return compose_prompt(
        identity,
        "artwork_bite",
        artist_name=artist_name,
        artwork_name=artwork_name
    )


def get_suggest_topics_prompt_v2(
    artist_name: str,
    artwork_name: str,
    previous_insights: list,
    identity: str = "default"
) -> str:
    """
    Get the suggest topics prompt using composable system.

    Args:
        artist_name: Name of the artist
        artwork_name: Name of the artwork
        previous_insights: List of previous insights shared
        identity: Identity to use ("default" maps to "art_historian")

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
        artist_name=artist_name,
        artwork_name=artwork_name,
        previous_insights=insights_text
    )
