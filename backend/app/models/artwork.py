from enum import Enum


class ToneType(str, Enum):
    PROFESSIONAL = "professional"
    GENERAL = "general"
    SARCASTIC = "sarcastic"
    EDUCATIONAL = "educational"
    POETIC = "poetic"


class AIProvider(str, Enum):
    OPENAI = "openai"
    CLAUDE = "claude"
    GEMINI = "gemini"