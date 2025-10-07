import os
from pathlib import Path
from functools import lru_cache
from app.models.artwork import ToneType


PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
TONES_DIR = PROMPTS_DIR / "tones"
ARTIST_IDENTIFICATION_PROMPT_PATH = PROMPTS_DIR / "artist_identification.txt"
ARTWORK_ANALYSIS_PROMPT_PATH = PROMPTS_DIR / "artwork_analysis.txt"


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
