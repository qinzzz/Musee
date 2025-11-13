from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base
import uuid


class SavedArtwork(Base):
    """Database model for saved artworks"""

    __tablename__ = "saved_artworks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    photo_uri = Column(String, nullable=False)  # Local file path or URI
    artist_name = Column(String, nullable=False)
    artwork_name = Column(String, nullable=False)
    location = Column(String, nullable=True)  # Geographic location where photo was taken
    museum_name = Column(String, nullable=True)  # Museum or gallery name
    summary = Column(String, nullable=True)  # One-sentence fun summary of the artwork
    is_recognized = Column(Integer, default=1)  # 1 for recognized, 0 for unknown
    user_id = Column(String, nullable=True)  # For future user authentication
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship to conversations
    conversations = relationship("Conversation", back_populates="artwork", cascade="all, delete-orphan", order_by="Conversation.sequence_number")

    def to_dict(self, include_conversations=True):
        """Convert model to dictionary

        Args:
            include_conversations: Whether to include conversation_history array (default True)
        """
        result = {
            "id": self.id,
            "photo_uri": self.photo_uri,
            "artist_name": self.artist_name,
            "artwork_name": self.artwork_name,
            "location": self.location,
            "museum_name": self.museum_name,
            "summary": self.summary,
            "is_recognized": self.is_recognized,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

        # Include conversation_history for backward compatibility with frontend
        if include_conversations:
            result["conversation_history"] = [
                {
                    "role": conv.role,
                    "content": conv.content,
                    "metadata": conv.message_metadata
                }
                for conv in sorted(self.conversations, key=lambda x: x.sequence_number)
            ]

        return result


class Conversation(Base):
    """Database model for individual conversation messages"""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint('saved_artwork_id', 'sequence_number', name='uq_artwork_sequence'),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    saved_artwork_id = Column(String, ForeignKey('saved_artworks.id', ondelete='CASCADE'), nullable=False)
    sequence_number = Column(Integer, nullable=False)  # Explicit ordering
    role = Column(String(10), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    message_metadata = Column(JSON, nullable=True)  # Optional metadata (topic, timestamp, etc.)
    created_at = Column(DateTime, server_default=func.now())

    # Relationship to artwork
    artwork = relationship("SavedArtwork", back_populates="conversations")

    def to_dict(self):
        """Convert model to dictionary"""
        return {
            "id": self.id,
            "saved_artwork_id": self.saved_artwork_id,
            "sequence_number": self.sequence_number,
            "role": self.role,
            "content": self.content,
            "metadata": self.message_metadata,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }