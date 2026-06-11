from sqlalchemy import Column, Integer, SmallInteger, String, Text, DateTime, JSON, ForeignKey, UniqueConstraint, Index
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
    google_id = Column(String, nullable=True, unique=True, index=True)  # Google account ID
    profile_picture_url = Column(String, nullable=True)  # URL to Google profile picture
    full_name = Column(String, nullable=True)  # User's full name from Google
    created_at = Column(DateTime, server_default=func.now())
    last_active = Column(DateTime, server_default=func.now(), onupdate=func.now())
    settings = Column(JSON, nullable=True)  # User preferences and settings
    skill_stats = Column(JSON, nullable=True)  # {"skill_name": {"observations": N, "deepdives": N, "xp": N}}
    tier = Column(String(20), nullable=False, server_default='free')  # 'free' | 'member' | 'power'

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
            "full_name": self.full_name,
            "profile_picture_url": self.profile_picture_url,
            "google_id": self.google_id,
            "device_id": self.device_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_active": self.last_active.isoformat() if self.last_active else None,
            "settings": self.settings,
            "tier": self.tier or "free",
        }


class SavedArtwork(Base):
    """Database model for saved artworks"""

    __tablename__ = "saved_artworks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    photo_uri = Column(String, nullable=False)  # Local file path or URI
    artist_name = Column(String, nullable=False)
    artwork_name = Column(String, nullable=False)
    location = Column(JSON, nullable=True)  # Geographic location where photo was taken (JSON struct)
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
    movement = Column(String, nullable=True)  # Canonical art movement (e.g. "Arte Povera", "Minimalism")
    period_bucket = Column(String, nullable=True)  # Historical / Modern / Contemporary / Now
    reference_urls = Column(JSON, nullable=True)  # Top reference URLs from Vision web detection
    artwork_entity_id = Column(String, ForeignKey('artwork_entities.id', ondelete='SET NULL'), nullable=True, index=True)
    artist_entity_id = Column(String, ForeignKey('artist_entities.id', ondelete='SET NULL'), nullable=True, index=True)
    insights = Column(JSON, nullable=True)  # Cached "Behind the Frame" insights [{title, text}, ...]
    classification = Column(String(20), nullable=False, server_default='unsorted')
    classification_updated_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="artworks")
    artwork_entity = relationship("ArtworkEntity", back_populates="instances")
    artist_entity = relationship("ArtistEntity", back_populates="artworks")
    # conversations relationship removed — table deprecated, all chat is now session-level (see SessionMessage)
    collections = relationship("Collection", secondary="collection_artworks", back_populates="artworks")
    artwork_tags = relationship("Tag", secondary="artwork_tags", back_populates="artworks")
    session = relationship("Session", back_populates="artworks")
    session_links = relationship(
        "SessionArtwork",
        back_populates="artwork",
        cascade="all, delete-orphan",
        order_by="SessionArtwork.sequence_number",
    )

    def to_dict(self, include_conversations=False):
        """Convert model to dictionary. include_conversations param retained for call-site compatibility but no longer used."""
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
            "session_title": self.session.title if self.session else None,
            "session_links": [link.to_dict() for link in self.session_links] if hasattr(self, 'session_links') else [],
            "artwork_tags": [tag.to_dict() for tag in self.artwork_tags] if hasattr(self, 'artwork_tags') else [],
            "date": self.params.get('date') if self.params and isinstance(self.params, dict) else None,
            "medium": self.params.get('medium') if self.params and isinstance(self.params, dict) else None,
            "movement": self.movement,
            "period_bucket": self.period_bucket,
            "reference_urls": self.reference_urls or [],
            "insights": self.insights or [],
            "artist_entity_id": self.artist_entity_id,
            "classification": self.classification or "unsorted",
        }

        result["conversation_history"] = []  # deprecated; conversations now live in session_messages

        return result


class Conversation(Base):
    """DEPRECATED — per-artwork chat messages. All chat is now session-level; see SessionMessage.
    Table retained for historical data only. Do not write new records here."""

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

    # relationship removed — table deprecated

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
    title = Column(String, nullable=True)  # Visit Name (can be museum, city, or user-provided)
    narrative_summary = Column(Text, nullable=True)  # Compressed thematic distillation
    metadata_json = Column(JSON, nullable=True)  # Renamed from 'metadata' to avoid conflict with Base.metadata
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="sessions")
    artworks = relationship("SavedArtwork", back_populates="session")
    artwork_links = relationship(
        "SessionArtwork",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionArtwork.sequence_number",
    )
    messages = relationship("SessionMessage", back_populates="session", cascade="all, delete-orphan", order_by="SessionMessage.sequence_number")

    def to_dict(self, include_artworks=False):
        """Convert model to dictionary"""
        result = {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "narrative_summary": self.narrative_summary,
            "metadata": self.metadata_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
        if include_artworks:
            if self.artwork_links:
                result["artworks"] = [link.artwork.to_dict(include_conversations=False) for link in self.artwork_links if link.artwork]
            else:
                result["artworks"] = [artwork.to_dict(include_conversations=False) for artwork in self.artworks]
        return result


class SessionArtwork(Base):
    """Many-to-many session membership for saved artworks."""

    __tablename__ = "session_artworks"
    __table_args__ = (
        UniqueConstraint("session_id", "artwork_id", name="uq_session_artwork"),
        Index("idx_session_artworks_session_sequence", "session_id", "sequence_number"),
        Index("idx_session_artworks_artwork_id", "artwork_id"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    artwork_id = Column(String, ForeignKey("saved_artworks.id", ondelete="CASCADE"), nullable=False)
    sequence_number = Column(Integer, nullable=False, default=0)
    source = Column(String(20), nullable=False, default="library")
    created_at = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="artwork_links")
    artwork = relationship("SavedArtwork", back_populates="session_links")

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "session_title": self.session.title if self.session else None,
            "artwork_id": self.artwork_id,
            "sequence_number": self.sequence_number,
            "source": self.source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SessionMessage(Base):
    """A single event in a visit/session conversation stream.

    type='text'            — user or model free-text message
    type='artwork_capture' — user uploaded an artwork (role='user')
    type='artwork_card'    — model's artwork analysis card response (role='model')
    """

    __tablename__ = "session_messages"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id      = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False, index=True)
    role            = Column(String(10), nullable=False)   # 'user' | 'model'
    type            = Column(String(20), nullable=False, default='text')  # 'text' | 'artwork_capture' | 'artwork_card'
    content         = Column(Text, nullable=True)          # populated for type='text'
    artwork_id      = Column(String, ForeignKey('saved_artworks.id', ondelete='SET NULL'), nullable=True)
    sequence_number = Column(Integer, nullable=False)
    created_at      = Column(DateTime, server_default=func.now())

    session = relationship("Session", back_populates="messages")
    artwork = relationship("SavedArtwork")

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role,
            "type": self.type,
            "content": self.content,
            "artwork_id": self.artwork_id,
            "sequence_number": self.sequence_number,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ArtworkEntity(Base):
    """Canonical artwork entity — shared across all users' instances of the same work."""

    __tablename__ = "artwork_entities"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    canonical_artist = Column(String, nullable=False)  # normalized lowercase
    canonical_title = Column(String, nullable=False)   # normalized lowercase
    display_artist = Column(String, nullable=False)    # original casing from first recognition
    display_title = Column(String, nullable=False)
    instance_count = Column(Integer, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Taste dimension scores — -1=left pole, 0=neutral, 1=right pole, NULL=not yet analyzed
    dim_figurative_abstract  = Column(SmallInteger, nullable=True)
    dim_emotive_conceptual   = Column(SmallInteger, nullable=True)
    dim_serene_intense       = Column(SmallInteger, nullable=True)
    dim_classical_avantgarde = Column(SmallInteger, nullable=True)
    dim_playful_serious      = Column(SmallInteger, nullable=True)
    dim_status      = Column(String(20), default='pending')
    dim_analyzed_at = Column(DateTime, nullable=True)
    dim_error       = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint('canonical_artist', 'canonical_title', name='uq_entity_artist_title'),
    )

    instances = relationship("SavedArtwork", back_populates="artwork_entity")
    public_comments = relationship("PublicComment", back_populates="entity", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "display_artist": self.display_artist,
            "display_title": self.display_title,
            "instance_count": self.instance_count,
            "dim_status": self.dim_status,
            "dims": {
                "figurative_abstract": self.dim_figurative_abstract,
                "emotive_conceptual": self.dim_emotive_conceptual,
                "serene_intense": self.dim_serene_intense,
                "classical_avantgarde": self.dim_classical_avantgarde,
                "playful_serious": self.dim_playful_serious,
            } if self.dim_status == 'done' else None,
        }


class PublicComment(Base):
    """A comment published by a user to a shared artwork entity."""

    __tablename__ = "public_comments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    entity_id = Column(String, ForeignKey('artwork_entities.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    entity = relationship("ArtworkEntity", back_populates="public_comments")
    author = relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "entity_id": self.entity_id,
            "user_id": self.user_id,
            "author_name": self.author.full_name or self.author.username or "Anonymous" if self.author else "Anonymous",
            "author_avatar": self.author.profile_picture_url if self.author else None,
            "text": self.text,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ArtistEntity(Base):
    """Canonical artist entity — shared across all users' instances of artworks by this artist."""

    __tablename__ = "artist_entities"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    canonical_name = Column(String, nullable=False, unique=True)  # normalized lowercase
    display_name = Column(String, nullable=False)                  # original casing from first recognition
    bio = Column(Text, nullable=True)                              # AI-generated biography paragraph
    nationality = Column(String, nullable=True)
    birth_year = Column(Integer, nullable=True)
    death_year = Column(Integer, nullable=True)
    movements = Column(JSON, nullable=True)                        # list of movement name strings
    profile_image_url = Column(String, nullable=True)              # Wikimedia Commons thumbnail
    instance_count = Column(Integer, default=1)
    bio_status = Column(String(20), default='pending')             # 'pending' | 'done' | 'failed'
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    artworks = relationship("SavedArtwork", back_populates="artist_entity")

    def to_dict(self):
        return {
            "id": self.id,
            "display_name": self.display_name,
            "bio": self.bio,
            "nationality": self.nationality,
            "birth_year": self.birth_year,
            "death_year": self.death_year,
            "movements": self.movements or [],
            "profile_image_url": self.profile_image_url,
            "instance_count": self.instance_count,
            "bio_status": self.bio_status,
        }


class SkillEvent(Base):
    """Log of interactive explore skill usage — drives taste profile."""

    __tablename__ = "skill_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    artwork_id = Column(String, ForeignKey('saved_artworks.id', ondelete='SET NULL'), nullable=True)
    skill_name = Column(String, nullable=False)
    skill_cat = Column(String, nullable=False)   # PERCEPTION | HISTORY | INTENT | STRUCTURE | RESONANCE
    event_type = Column(String(20), nullable=False)  # "observation" | "deepdive"
    created_at = Column(DateTime, server_default=func.now())


class TasteProfile(Base):
    """Persisted taste profile snapshot for a user."""

    __tablename__ = "taste_profiles"

    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True)
    status = Column(String(20), nullable=False, server_default='not_ready')
    eligible_count = Column(Integer, nullable=False, server_default='0')
    required_count = Column(Integer, nullable=False, server_default='5')
    love_count = Column(Integer, nullable=False, server_default='0')
    reject_count = Column(Integer, nullable=False, server_default='0')
    respect_count = Column(Integer, nullable=False, server_default='0')
    is_outdated = Column(Integer, nullable=False, server_default='0')
    generated_at = Column(DateTime, nullable=True)
    outdated_at = Column(DateTime, nullable=True)
    love_vector = Column(JSON, nullable=True)
    reject_vector = Column(JSON, nullable=True)
    taste_vector = Column(JSON, nullable=True)
    source_artwork_ids = Column(JSON, nullable=True)
    narrative_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User")

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "status": self.status,
            "eligible_count": self.eligible_count,
            "required_count": self.required_count,
            "love_count": self.love_count,
            "reject_count": self.reject_count,
            "respect_count": self.respect_count,
            "is_outdated": bool(self.is_outdated),
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "outdated_at": self.outdated_at.isoformat() if self.outdated_at else None,
            "love_vector": self.love_vector or {},
            "reject_vector": self.reject_vector or {},
            "taste_vector": self.taste_vector or {},
            "source_artwork_ids": self.source_artwork_ids or [],
            "narrative_summary": self.narrative_summary,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
