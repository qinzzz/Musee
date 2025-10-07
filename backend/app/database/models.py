from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from app.database.connection import Base
import uuid


class ArtworkAnalysis(Base):
    """Database model for artwork analysis records"""
    
    __tablename__ = "artwork_analyses"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    image_path = Column(String, nullable=False)
    image_metadata = Column(JSON, nullable=False)
    tone = Column(String, nullable=False)
    ai_model = Column(String, nullable=False)
    analysis_text = Column(Text, nullable=False)
    user_id = Column(String, nullable=True)  # For future user authentication
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            "id": self.id,
            "image_path": self.image_path,
            "image_metadata": self.image_metadata,
            "tone": self.tone,
            "ai_model": self.ai_model,
            "analysis_text": self.analysis_text,
            "user_id": self.user_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }