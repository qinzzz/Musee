from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base
import uuid


class User(Base):
    """Database model for users"""

    __tablename__ = "users"

    user_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, nullable=True, unique=True)  # Optional username for user accounts
    email = Column(String, nullable=True, unique=True)  # Optional email for user accounts
    device_id = Column(String, nullable=True, unique=True)  # Unique device identifier from Keychain
    created_at = Column(DateTime, server_default=func.now())
    last_active = Column(DateTime, server_default=func.now(), onupdate=func.now())
    settings = Column(JSON, nullable=True)  # User preferences and settings

    # Relationship to artworks
    artworks = relationship("SavedArtwork", back_populates="user", cascade="all, delete-orphan")
    collections = relationship("Collection", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert model to dictionary"""
        return {
            "user_id": self.user_id,
            "username": self.username,
            "email": self.email,
            "device_id": self.device_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_active": self.last_active.isoformat() if self.last_active else None,
            "settings": self.settings
        }


class SavedArtwork(Base):
    """Database model for saved artworks"""

    __tablename__ = "saved_artworks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    photo_uri = Column(String, nullable=False)  # Local file path or URI
    artist_name = Column(String, nullable=False)
    artwork_name = Column(String, nullable=False)
    location = Column(String, nullable=True)  # Geographic location where photo was taken
    photo_time = Column(String, nullable=True)  # Original capture time of the photo
    museum_name = Column(String, nullable=True)  # Museum or gallery name
    summary = Column(String, nullable=True)  # One-sentence fun summary of the artwork
    analysis = Column(Text, nullable=True)  # Detailed artwork analysis from AI (markdown formatted)
    params = Column(JSON, nullable=True)  # Additional parameters (colors, metadata, etc.)
    is_recognized = Column(Integer, default=1)  # 1 for recognized, 0 for unknown
    device_id = Column(String, nullable=True)  # Temporary: Persistent device identifier from Keychain UUID (for backwards compatibility)
    user_id = Column(String, ForeignKey('users.user_id', ondelete='SET NULL'), nullable=True)  # Foreign key to users table
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    session_id = Column(String, ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True, index=True)

    # Relationships
    user = relationship("User", back_populates="artworks")
    conversations = relationship("Conversation", back_populates="artwork", cascade="all, delete-orphan", order_by="Conversation.sequence_number")
    collections = relationship("Collection", secondary="collection_artworks", back_populates="artworks")
    artwork_tags = relationship("Tag", secondary="artwork_tags", back_populates="artworks")
    session = relationship("Session", back_populates="artworks")

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
            "photo_time": self.photo_time,
            "museum_name": self.museum_name,
            "summary": self.summary,
            "analysis": self.analysis,
            "params": self.params,
            "is_recognized": self.is_recognized,
            "device_id": self.device_id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "session_id": self.session_id,
            "artwork_tags": [tag.to_dict() for tag in self.artwork_tags] if hasattr(self, 'artwork_tags') else [],
            "date": self.params.get('date') if self.params and isinstance(self.params, dict) else None,
            "medium": self.params.get('medium') if self.params and isinstance(self.params, dict) else None
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


class CollectionArtwork(Base):
    """Junction table for collections and artworks"""
    __tablename__ = "collection_artworks"
    
    collection_id = Column(String, ForeignKey('collections.id', ondelete='CASCADE'), primary_key=True)
    artwork_id = Column(String, ForeignKey('saved_artworks.id', ondelete='CASCADE'), primary_key=True)


class Collection(Base):
    """Database model for collections"""

    __tablename__ = "collections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="collections")
    artworks = relationship("SavedArtwork", secondary="collection_artworks", back_populates="collections")

    def to_dict(self, include_artworks=False):
        """Convert model to dictionary"""
        try:
            # Safely get artworks list to avoid lazy loading issues outside session
            artwork_list = list(self.artworks) if self.artworks else []
            
            if include_artworks:
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"[Model] to_dict for '{self.name}': artwork_list len = {len(artwork_list)}")
            
            result = {
                "id": self.id,
                "name": self.name,
                "description": self.description,
                "user_id": self.user_id,
                "artwork_count": len(artwork_list),
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None
            }
            
            if include_artworks:
                result["artworks"] = [artwork.to_dict(include_conversations=False) for artwork in artwork_list]
                
            return result
        except Exception as e:
            # Log error if possible, or at least return partial dict
            return {
                "id": self.id,
                "name": self.name,
                "error": str(e),
                "artwork_count": 0
            }


class Tag(Base):
    """Database model for global tags (not user-specific)"""

    __tablename__ = "tags"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True, index=True)  # Normalized tag name (lowercase, with #)
    explanation = Column(Text, nullable=True)  # LLM-generated one-sentence explanation
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    artworks = relationship("SavedArtwork", secondary="artwork_tags", back_populates="artwork_tags")

    def to_dict(self):
        """Convert model to dictionary"""
        return {
            "id": self.id,
            "name": self.name,
            "explanation": self.explanation,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class ArtworkTag(Base):
    """Junction table for artworks and tags"""
    __tablename__ = "artwork_tags"

    artwork_id = Column(String, ForeignKey('saved_artworks.id', ondelete='CASCADE'), primary_key=True)
    tag_id = Column(String, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True)


class Session(Base):
    """Database model for exploration sessions / visits"""

    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    narrative_summary = Column(Text, nullable=True)  # Compressed thematic distillation
    metadata_json = Column(JSON, nullable=True)  # Renamed from 'metadata' to avoid conflict with Base.metadata
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="sessions")
    artworks = relationship("SavedArtwork", back_populates="session")

    def to_dict(self, include_artworks=False):
        """Convert model to dictionary"""
        result = {
            "id": self.id,
            "user_id": self.user_id,
            "narrative_summary": self.narrative_summary,
            "metadata": self.metadata_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
        if include_artworks:
            result["artworks"] = [artwork.to_dict(include_conversations=False) for artwork in self.artworks]
        return result