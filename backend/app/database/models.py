from sqlalchemy import Boolean, Column, Date, Integer, SmallInteger, String, Text, DateTime, JSON, ForeignKey, UniqueConstraint, Index, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.connection import Base
from app.services.session_event_service import (
    derive_session_event_artwork_ids,
    legacy_session_transport_type,
    normalize_session_event_type,
)
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
    tier = Column(String(20), nullable=False, server_default='free')  # matches keys of app.config.plans.PLANS
    # True once inbox ownership was proven (Google sign-in, or a clicked
    # verification link). Gates login for password accounts and the
    # email-based account-linking rules.
    email_verified = Column(Boolean, nullable=False, server_default=text("false"))

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
            "email_verified": bool(self.email_verified),
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
    movement = Column(String, nullable=True)  # Canonical art movement (e.g. "Arte Povera", "Minimalism")
    period_bucket = Column(String, nullable=True)  # Historical / Modern / Contemporary / Now
    reference_urls = Column(JSON, nullable=True)  # Top reference URLs from Vision web detection
    artwork_entity_id = Column(String, ForeignKey('artwork_entities.id', ondelete='SET NULL'), nullable=True, index=True)
    artist_entity_id = Column(String, ForeignKey('artist_entities.id', ondelete='SET NULL'), nullable=True, index=True)
    insights = Column(JSON, nullable=True)  # Cached "Behind the Frame" insights [{title, text}, ...]
    classification = Column(String(20), nullable=False, server_default='unsorted')
    classification_updated_at = Column(DateTime, nullable=True)
    analysis_status = Column(String(20), nullable=False, server_default='analyzed')
    analysis_error = Column(Text, nullable=True)
    analysis_attempted_at = Column(DateTime, nullable=True)
    analysis_completed_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="artworks")
    artwork_entity = relationship("ArtworkEntity", back_populates="instances")
    artist_entity = relationship("ArtistEntity", back_populates="artworks")
    # conversations relationship removed — table deprecated, all chat is now session-level (see SessionEvent)
    collections = relationship("Collection", secondary="collection_artworks", back_populates="artworks")
    artwork_tags = relationship("Tag", secondary="artwork_tags", back_populates="artworks")
    session_links = relationship(
        "SessionArtwork",
        back_populates="artwork",
        cascade="all, delete-orphan",
        order_by="SessionArtwork.sequence_number",
    )
    artwork_events = relationship(
        "ArtworkEvent",
        back_populates="artwork",
        cascade="all, delete-orphan",
        order_by="ArtworkEvent.created_at",
    )

    def to_dict(self):
        """Convert model to dictionary."""
        session_links = [link.to_dict() for link in self.session_links] if hasattr(self, 'session_links') else []
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
            "session_links": session_links,
            "artwork_tags": [tag.to_dict() for tag in self.artwork_tags] if hasattr(self, 'artwork_tags') else [],
            "date": self.params.get('date') if self.params and isinstance(self.params, dict) else None,
            "medium": self.params.get('medium') if self.params and isinstance(self.params, dict) else None,
            "movement": self.movement,
            "period_bucket": self.period_bucket,
            "reference_urls": self.reference_urls or [],
            "insights": self.insights or [],
            "artist_entity_id": self.artist_entity_id,
            "classification": self.classification or "unsorted",
            "analysis_status": self.analysis_status or "analyzed",
            "analysis_error": self.analysis_error,
            "analysis_attempted_at": self.analysis_attempted_at.isoformat() if self.analysis_attempted_at else None,
            "analysis_completed_at": self.analysis_completed_at.isoformat() if self.analysis_completed_at else None,
        }

        return result


class CollectionArtwork(Base):
    """Junction table for collections and artworks"""
    __tablename__ = "collection_artworks"
    
    collection_id = Column(String, ForeignKey('collections.id', ondelete='CASCADE'), primary_key=True)
    artwork_id = Column(String, ForeignKey('saved_artworks.id', ondelete='CASCADE'), primary_key=True)


class Collection(Base):
    """Database model for collections"""

    __tablename__ = "collections"
    __table_args__ = (
        Index("idx_collections_user_id", "user_id"),
    )

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
                result["artworks"] = [artwork.to_dict() for artwork in artwork_list]
                
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
    __table_args__ = (
        Index("idx_sessions_user_updated", "user_id", "updated_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    title = Column(String, nullable=True)  # Backward-compatible displayed title
    user_title = Column(String, nullable=True)  # Manual user override
    system_title = Column(String, nullable=True)  # Backend-generated automatic title
    title_state = Column(String(20), nullable=False, server_default='draft')  # draft | auto | user_locked
    narrative_summary = Column(Text, nullable=True)  # Compressed thematic distillation
    metadata_json = Column(JSON, nullable=True)  # Renamed from 'metadata' to avoid conflict with Base.metadata
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="sessions")
    artwork_links = relationship(
        "SessionArtwork",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionArtwork.sequence_number",
    )
    events = relationship("SessionEvent", back_populates="session", cascade="all, delete-orphan", order_by="SessionEvent.sequence_number")

    def to_dict(self, include_artworks=False):
        """Convert model to dictionary"""
        result = {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "user_title": self.user_title,
            "system_title": self.system_title,
            "title_state": self.title_state,
            "narrative_summary": self.narrative_summary,
            "metadata": self.metadata_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
        if include_artworks:
            result["artworks"] = [link.artwork.to_dict() for link in self.artwork_links if link.artwork]
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
            "artwork_id": self.artwork_id,
            "sequence_number": self.sequence_number,
            "source": self.source,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SessionEvent(Base):
    """A single event in a session conversation stream."""

    __tablename__ = "session_events"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id      = Column(String, ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False, index=True)
    role            = Column(String(10), nullable=False)   # 'user' | 'model' | 'system'
    type            = Column(String(20), nullable=False, default='message')  # canonical event type
    content         = Column(Text, nullable=True)          # primarily used for event_type='message'
    trigger_event_id = Column(String, nullable=True)
    payload         = Column(JSON, nullable=True)
    sequence_number = Column(Integer, nullable=False)
    created_at      = Column(DateTime, server_default=func.now())

    __table_args__ = (
        # The ordering invariant the whole event architecture leans on:
        # confirmed history is totally ordered per session. Enforced here so a
        # concurrent-append race can never mint duplicate sequence numbers.
        UniqueConstraint("session_id", "sequence_number", name="uq_session_events_session_sequence"),
    )

    session = relationship("Session", back_populates="events")

    def to_dict(self):
        canonical_type = normalize_session_event_type(self.type, role=self.role)
        payload_artwork_ids = derive_session_event_artwork_ids(
            canonical_type,
            self.payload,
        )
        primary_artwork_id = payload_artwork_ids[0] if payload_artwork_ids else None
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role,
            "type": legacy_session_transport_type(self.type, role=self.role, artwork_ids=payload_artwork_ids),
            "event_type": canonical_type,
            "content": self.content,
            "artwork_id": primary_artwork_id,
            "artwork_ids": payload_artwork_ids,
            "trigger_event_id": self.trigger_event_id,
            "payload": self.payload,
            "sequence_number": self.sequence_number,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ArtworkEvent(Base):
    """Immutable artwork lifecycle event."""

    __tablename__ = "artwork_events"
    __table_args__ = (
        Index("idx_artwork_events_artwork_created", "artwork_id", "created_at"),
        Index("idx_artwork_events_session_created", "trigger_session_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    artwork_id = Column(String, ForeignKey("saved_artworks.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    actor_role = Column(String(20), nullable=False, default="system")
    trigger_source = Column(String(30), nullable=True)
    trigger_session_id = Column(String, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    trigger_event_id = Column(String, nullable=True)
    parent_event_id = Column(String, ForeignKey("artwork_events.id", ondelete="SET NULL"), nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    artwork = relationship("SavedArtwork", back_populates="artwork_events")
    trigger_session = relationship("Session", foreign_keys=[trigger_session_id])
    parent_event = relationship("ArtworkEvent", remote_side=[id])

    def to_dict(self):
        return {
            "id": self.id,
            "artwork_id": self.artwork_id,
            "event_type": self.event_type,
            "actor_role": self.actor_role,
            "trigger_source": self.trigger_source,
            "trigger_session_id": self.trigger_session_id,
            "trigger_event_id": self.trigger_event_id,
            "parent_event_id": self.parent_event_id,
            "payload": self.payload,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AIUsage(Base):
    """Best-effort AI usage telemetry.

    This is operational logging, not product state. Product flows must not
    depend on these rows existing.
    """

    __tablename__ = "ai_usage"
    __table_args__ = (
        Index("idx_ai_usage_user_started", "user_id", "started_at"),
        Index("idx_ai_usage_subject", "subject_type", "subject_id"),
        Index("idx_ai_usage_job_status", "job_type", "status"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=True, index=True)
    job_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="running")
    model = Column(String, nullable=True)
    subject_type = Column(String(50), nullable=True)
    subject_id = Column(String, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, server_default=func.now(), nullable=False)
    completed_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "job_type": self.job_type,
            "status": self.status,
            "model": self.model,
            "subject_type": self.subject_type,
            "subject_id": self.subject_id,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
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


class DailyUsage(Base):
    """Per-user, per-day usage rollup for quota checks.

    ai_usage stays the token ledger (source of truth); this table exists so
    quota decisions are an O(1) primary-key read instead of a SUM over a
    growing ledger. Rows are written via atomic upsert in the same
    transaction as the tracked action.
    """

    __tablename__ = "daily_usage"

    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True)
    day = Column(Date, primary_key=True)
    tokens_in = Column(Integer, nullable=False, server_default='0')
    tokens_out = Column(Integer, nullable=False, server_default='0')
    artworks_uploaded = Column(Integer, nullable=False, server_default='0')
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "day": self.day.isoformat() if self.day else None,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "artworks_uploaded": self.artworks_uploaded,
        }


class UserCredential(Base):
    """Password credential for accounts that use email/password login.

    Deliberately a separate table from users: most accounts (Google,
    anonymous) never have one, and keeping the hash out of the widely
    serialized users row makes accidental exposure structurally impossible.
    """

    __tablename__ = "user_credentials"

    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EmailToken(Base):
    """Single-use emailed proof-of-inbox-ownership tokens.

    One mechanism serves email verification, password reset, and adding a
    password to a Google-first account. Only the SHA-256 of the token is
    stored — the raw value exists solely inside the sent email, so a
    database leak cannot be replayed. A token is valid iff the hash and
    purpose match, expires_at is in the future, and used_at is NULL;
    consumption stamps used_at atomically.
    """

    __tablename__ = "email_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    purpose = Column(String(30), nullable=False)  # 'verify_email' | 'reset_password'
    token_hash = Column(String(64), nullable=False, unique=True)
    # Device account to adopt when a verification link is clicked — carried
    # here because the link often opens in a different browser than the one
    # that signed up, where localStorage has no device id.
    anonymous_user_id = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
