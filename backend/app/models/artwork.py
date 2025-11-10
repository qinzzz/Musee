from enum import Enum
from pydantic import BaseModel
from typing import Optional


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


class UpdateArtworkRequest(BaseModel):
    """Request model for updating saved artwork details"""
    artist_name: str
    artwork_name: str