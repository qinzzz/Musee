from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
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


class ImageMetadata(BaseModel):
    filename: str
    size: int
    dimensions: tuple[int, int]
    format: str
    upload_timestamp: datetime


class ArtworkAnalysisRequest(BaseModel):
    tone: ToneType = ToneType.GENERAL
    model: Optional[AIProvider] = None


class ArtworkAnalysisResponse(BaseModel):
    id: str
    analysis: str
    metadata: ImageMetadata
    tone: ToneType
    model_used: AIProvider
    timestamp: datetime
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ArtworkAnalysisCreate(BaseModel):
    image_path: str
    image_metadata: Dict[str, Any]
    tone: ToneType
    ai_model: AIProvider
    analysis_text: str
    user_id: Optional[str] = None


class CollectionResponse(BaseModel):
    analyses: list[ArtworkAnalysisResponse]
    total: int
    page: int
    per_page: int