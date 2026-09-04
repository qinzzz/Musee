import json
from pathlib import Path
from functools import lru_cache


PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
IDENTITIES_DIR = PROMPTS_DIR / "identities"
INSTRUCTIONS_DIR = PROMPTS_DIR / "instructions"
DATA_DIR = Path(__file__).parent.parent / "data"

DEFAULT_IDENTITY = "museum_narrator"   # professional tone — used for artwork cards
COMPANION_IDENTITY = "companion"        # friendly/casual tone — used for chat-like interfaces


def inject_identity(template: str, identity_name: str) -> str:
    """Replace a {identity} placeholder in a template with the named identity's text.

    No-op if the template has no {identity} placeholder.
    """
    if "{identity}" not in template:
        return template
    return template.replace("{identity}", load_identity(identity_name).strip())


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
    
    lang_instr = build_language_instruction(language)
    if lang_instr:
        prompt += f"\n\n{lang_instr}"

    return prompt


@lru_cache(maxsize=1)
def load_journal_generation_prompt() -> str:
    return _load_prompt_file(INSTRUCTIONS_DIR / "journal_generation.txt")


def get_journal_generation_prompt(evidence_package: str) -> str:
    return load_journal_generation_prompt().replace("{evidence_package}", evidence_package)


def build_language_instruction(language) -> str:
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
    template = load_instruction("explore_skill_select")
    if artist_name:
        artwork_context = (
            f'Artwork context: "{artwork_name or "Unknown"}" by {artist_name}. '
            "Use this to select the most relevant and insightful skills.\n"
        )
    else:
        artwork_context = ""
    return (
        template
        .replace("{artwork_context}", artwork_context)
        .replace("{language_instruction}", build_language_instruction(language))
    )


def get_explore_observation_prompt(
    skill_name: str,
    skill_desc: str,
    prev_observations=None,
    language=None,
) -> str:
    template = inject_identity(load_instruction("explore_observation"), COMPANION_IDENTITY)
    previous = ""
    if prev_observations:
        previous = "Already shared with the visitor (do not repeat or rephrase):\n" + "\n".join(
            f"- {observation}" for observation in prev_observations
        )
    return (
        template
        .replace("{skill_name}", skill_name)
        .replace("{skill_desc}", skill_desc)
        .replace("{prev_observations_instruction}", previous)
        .replace("{language_instruction}", build_language_instruction(language))
    )


def get_explore_deepdive_prompt(
    skill_name: str,
    skill_desc: str,
    language=None,
) -> str:
    return (
        inject_identity(load_instruction("explore_deepdive"), COMPANION_IDENTITY)
        .replace("{skill_name}", skill_name)
        .replace("{skill_desc}", skill_desc)
        .replace("{language_instruction}", build_language_instruction(language))
    )


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
