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


class SavedArtwork(Base):
    """Database model for saved artworks with complete conversation history"""

    __tablename__ = "saved_artworks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    photo_uri = Column(String, nullable=False)  # Local file path or URI
    artist_name = Column(String, nullable=False)
    artwork_name = Column(String, nullable=False)
    location = Column(String, nullable=True)  # Geographic location where photo was taken
    museum_name = Column(String, nullable=True)  # Museum or gallery name
    conversation_history = Column(JSON, nullable=False)  # Complete conversation with user and AI messages
    conversation_id = Column(String, nullable=True)  # Link to original conversation
    is_recognized = Column(Integer, default=1)  # 1 for recognized, 0 for unknown
    user_id = Column(String, nullable=True)  # For future user authentication
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        """Convert model to dictionary"""
        return {
            "id": self.id,
            "photo_uri": self.photo_uri,
            "artist_name": self.artist_name,
            "artwork_name": self.artwork_name,
            "location": self.location,
            "museum_name": self.museum_name,
            "conversation_history": self.conversation_history,
            "conversation_id": self.conversation_id,
            "is_recognized": self.is_recognized,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }