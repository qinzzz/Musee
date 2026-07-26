from enum import Enum
from pydantic import BaseModel
from typing import Optional, Dict, Any


class AIProvider(str, Enum):
    OPENAI = "openai"
    CLAUDE = "claude"
    GEMINI = "gemini"


class UpdateArtworkRequest(BaseModel):
    """Request model for updating saved artwork details"""
    artist_name: Optional[str] = None
    artwork_name: Optional[str] = None
    tags: Optional[str] = None
    analysis: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    # Convenience fields — merged into params on the backend
    date: Optional[str] = None
    medium: Optional[str] = None


class UpdateArtworkClassificationRequest(BaseModel):
    classification: str
