from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, BackgroundTasks, Body
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional, List, Union, Dict, Any
import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime
import anyio

from app.database.connection import get_db, SessionLocal
from app.database.models import SavedArtwork, Conversation, Tag, User, Session as SessionModel, SessionArtwork, SkillEvent, ArtworkEntity, ArtistEntity, PublicComment, SessionMessage, TasteProfile
from app.models.artwork import AIProvider, UpdateArtworkRequest, UpdateArtworkClassificationRequest
from pydantic import BaseModel
import base64
import httpx
from app.services.ai_service import AIServiceFactory
from app.services.openai_api_client import OpenAIAPIClient
from app.services.claude_api_client import ClaudeAPIClient
from app.services.gemini_api_client import GeminiAPIClient
from app.services.photoroom_service import photoroom_service
from app.utils.image_processing import process_image, reverse_geocode, compress_for_ai
from app.services.storage import get_storage_service, StorageFactory
from app.services.vision_service import get_vision_hint
from app.config.settings import settings
from app.utils.auth_utils import get_current_user, require_same_user
from app.utils.conversation_storage import ConversationMessage

router = APIRouter()
logger = logging.getLogger(__name__)
CLASSIFICATION_VALUES = {"unsorted", "love", "respect", "not_for_me"}
SESSION_ARTWORK_LIMIT = 5
TASTE_DIMENSIONS = [
    ("figurative_abstract", "dim_figurative_abstract", "具象", "抽象"),
    ("emotive_conceptual", "dim_emotive_conceptual", "感性", "理性"),
    ("serene_intense", "dim_serene_intense", "宁静", "张力"),
    ("classical_avantgarde", "dim_classical_avantgarde", "经典", "先锋"),
    ("playful_serious", "dim_playful_serious", "玩味", "严肃"),
]
PROFILE_MIN_SAMPLE = 5


def _ensure_session_artwork_link(
    db: Session,
    session_id: Optional[str],
    artwork_id: Optional[str],
    source: str = "library",
    sequence_number: Optional[int] = None,
):
    if not session_id or not artwork_id:
        return None

    existing = db.query(SessionArtwork).filter(
        SessionArtwork.session_id == session_id,
        SessionArtwork.artwork_id == artwork_id,
    ).first()
    if existing:
        if sequence_number is not None:
            existing.sequence_number = sequence_number
        if source:
            existing.source = source
        return existing

    if sequence_number is None:
        sequence_number = (db.query(func.max(SessionArtwork.sequence_number)).filter(
            SessionArtwork.session_id == session_id
        ).scalar() or 0) + 1

    link = SessionArtwork(
        session_id=session_id,
        artwork_id=artwork_id,
        sequence_number=sequence_number,
        source=source,
    )
    db.add(link)
    return link


def _normalize(s: str) -> str:
    """Lowercase, strip leading 'the ', collapse whitespace for entity matching."""
    s = s.lower().strip()
    if s.startswith("the "):
        s = s[4:]
    return re.sub(r"\s+", " ", s)


def upsert_artwork_entity(db, artist_name: str, artwork_name: str) -> "ArtworkEntity":
    """Return existing or newly created ArtworkEntity for the given artist+title."""
    can_artist = _normalize(artist_name)
    can_title = _normalize(artwork_name)
    entity = db.query(ArtworkEntity).filter_by(
        canonical_artist=can_artist, canonical_title=can_title
    ).first()
    if entity:
        entity.instance_count = (entity.instance_count or 0) + 1
    else:
        entity = ArtworkEntity(
            canonical_artist=can_artist,
            canonical_title=can_title,
            display_artist=artist_name,
            display_title=artwork_name,
            instance_count=1,
        )
        db.add(entity)
    return entity

def upsert_artist_entity(db, artist_name: str) -> "ArtistEntity":
    """Return existing or newly created ArtistEntity for the given artist name."""
    can_name = _normalize(artist_name)
    entity = db.query(ArtistEntity).filter_by(canonical_name=can_name).first()
    if entity:
        entity.instance_count = (entity.instance_count or 0) + 1
    else:
        entity = ArtistEntity(
            canonical_name=can_name,
            display_name=artist_name,
            instance_count=1,
        )
        db.add(entity)
    return entity


def _blank_vector() -> Dict[str, float]:
    return {key: 0.0 for key, *_ in TASTE_DIMENSIONS}


def _vector_from_rows(rows: List[SavedArtwork]) -> Dict[str, float]:
    vector: Dict[str, float] = {}
    for dim_key, dim_attr, *_ in TASTE_DIMENSIONS:
        vals: List[float] = []
        for artwork in rows:
            entity = artwork.artwork_entity
            if not entity or entity.dim_status != "done":
                continue
            val = getattr(entity, dim_attr)
            if val is not None:
                vals.append(float(val))
        vector[dim_key] = round(sum(vals) / len(vals), 3) if vals else 0.0
    return vector


def _derive_taste_vector(love_vector: Dict[str, float], reject_vector: Dict[str, float]) -> Dict[str, float]:
    taste_vector: Dict[str, float] = {}
    for dim_key, *_ in TASTE_DIMENSIONS:
        raw = float(love_vector.get(dim_key, 0.0)) - float(reject_vector.get(dim_key, 0.0))
        normalized = max(-1.0, min(1.0, raw / 2.0))
        taste_vector[dim_key] = round(normalized, 3)
    return taste_vector


def _build_taste_examples(artworks: List[SavedArtwork], taste_vector: Dict[str, float]) -> Dict[str, Any]:
    examples: Dict[str, Any] = {}
    for dim_key, dim_attr, left_label, right_label in TASTE_DIMENSIONS:
        score = taste_vector.get(dim_key, 0.0)
        if abs(score) < 0.15:
            continue
        dominant_sign = 1 if score >= 0 else -1
        candidates: List[Dict[str, Any]] = []
        seen: set[str] = set()
        sorted_rows = sorted(
            artworks,
            key=lambda art: -((getattr(art.artwork_entity, dim_attr, 0) or 0) * dominant_sign) if art.artwork_entity else 0
        )
        for artwork in sorted_rows:
            entity = artwork.artwork_entity
            if not entity or entity.dim_status != "done":
                continue
            dim_score = getattr(entity, dim_attr)
            if dim_score is None or dim_score * dominant_sign <= 0:
                continue
            name_key = (artwork.artwork_name or "").lower()
            if name_key in seen:
                continue
            seen.add(name_key)
            candidates.append({
                "artwork_id": artwork.id,
                "photo_url": artwork.photo_uri,
                "artist_name": artwork.artist_name,
                "artwork_name": artwork.artwork_name,
                "dim_score": dim_score,
                "classification": artwork.classification or "unsorted",
            })
            if len(candidates) >= 3:
                break
        if candidates:
            examples[dim_key] = {
                "dominant_pole": right_label if dominant_sign > 0 else left_label,
                "other_pole": left_label if dominant_sign > 0 else right_label,
                "examples": candidates,
            }
    return examples


def _get_profile_counts(user_id: str, db: Session) -> Dict[str, int]:
    counts = {key: 0 for key in CLASSIFICATION_VALUES}
    rows = (
        db.query(SavedArtwork.classification, func.count(SavedArtwork.id))
        .filter(SavedArtwork.user_id == user_id)
        .group_by(SavedArtwork.classification)
        .all()
    )
    for classification, count in rows:
        counts[classification or "unsorted"] = count
    return counts


async def _generate_taste_narrative(
    taste_vector: Dict[str, float],
    loved_artworks: List[SavedArtwork],
    rejected_artworks: List[SavedArtwork],
    respected_artworks: List[SavedArtwork],
) -> str:
    loved = [f"{art.artwork_name} by {art.artist_name}" for art in loved_artworks[:6]]
    rejected = [f"{art.artwork_name} by {art.artist_name}" for art in rejected_artworks[:6]]
    respected = [f"{art.artwork_name} by {art.artist_name}" for art in respected_artworks[:6]]
    vector_text = ", ".join(f"{k}: {v}" for k, v in taste_vector.items())
    prompt = f"""
You are writing a concise personal taste profile for an art exploration app.

Taste vector:
{vector_text}

Loved artworks:
{json.dumps(loved, ensure_ascii=False)}

Rejected artworks:
{json.dumps(rejected, ensure_ascii=False)}

Respected artworks (context only, not preference evidence):
{json.dumps(respected, ensure_ascii=False)}

Write 2 short paragraphs in a warm but analytical tone explaining the user's taste. Distinguish clearly between what they love and what they merely respect. Do not mention vectors or numeric scores.
""".strip()
    try:
        ai_provider = determine_ai_provider(None)
        ai_service = AIServiceFactory.get_service(ai_provider)
        response = await ai_service.ai_client.call_text_only(prompt, max_tokens=500, temperature=0.7)
        return response.strip()
    except Exception as exc:
        logger.warning("Taste profile narrative generation failed: %s", exc)
        loved_phrase = "、".join(loved[:3]) if loved else "目前还没有明确喜欢的作品"
        rejected_phrase = "、".join(rejected[:3]) if rejected else "目前还没有明确排斥的作品"
        respected_phrase = "、".join(respected[:2]) if respected else "暂无"
        return (
            f"你偏爱的作品集中在：{loved_phrase}。这些选择共同勾勒出你当前的审美倾向。"
            f"\n\n你明确不太投入的作品包括：{rejected_phrase}。你也会认可某些作品的重要性，例如：{respected_phrase}，但这种尊重并不等于个人偏爱。"
        )


def _mark_taste_profile_outdated(user_id: Optional[str], db: Session) -> bool:
    if not user_id:
        return False
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if not profile or profile.status != "generated":
        return False
    profile.status = "outdated"
    profile.is_outdated = 1
    profile.outdated_at = datetime.utcnow()
    return True


def _get_or_create_taste_profile(user_id: str, db: Session) -> TasteProfile:
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()
    if profile:
        return profile
    profile = TasteProfile(user_id=user_id)
    db.add(profile)
    db.flush()
    return profile


def _build_taste_profile_response(user_id: str, db: Session) -> Dict[str, Any]:
    counts = _get_profile_counts(user_id, db)
    eligible_count = counts.get("love", 0) + counts.get("not_for_me", 0)
    unsorted_count = counts.get("unsorted", 0)
    can_generate = eligible_count >= PROFILE_MIN_SAMPLE
    profile = db.query(TasteProfile).filter(TasteProfile.user_id == user_id).first()

    response: Dict[str, Any] = {
        "user_id": user_id,
        "status": "ready" if can_generate else "not_ready",
        "eligible_count": eligible_count,
        "required_count": PROFILE_MIN_SAMPLE,
        "unsorted_count": unsorted_count,
        "love_count": counts.get("love", 0),
        "reject_count": counts.get("not_for_me", 0),
        "respect_count": counts.get("respect", 0),
        "is_generated": bool(profile and profile.generated_at),
        "is_outdated": bool(profile and profile.is_outdated),
        "can_generate": can_generate,
    }

    if profile and profile.generated_at:
        persisted = profile.to_dict()
        for key in [
            "generated_at",
            "outdated_at",
            "love_vector",
            "reject_vector",
            "taste_vector",
            "source_artwork_ids",
            "narrative_summary",
            "created_at",
            "updated_at",
        ]:
            response[key] = persisted.get(key)
        response["status"] = profile.status or response["status"]
    return response


# Tasks that survive client disconnect — prevents garbage collection until done
_active_tasks: set = set()

# ── User tier quota ──────────────────────────────────────────────────────────
TIER_ARTWORK_LIMIT: dict[str, int | None] = {
    "free":   20,
    "member": 200,
    "power":  None,   # unlimited
}

def get_quota(tier: str) -> int | None:
    return TIER_ARTWORK_LIMIT.get(tier or "free", TIER_ARTWORK_LIMIT["free"])

def check_artwork_quota(user_id: str, db) -> None:
    """Raise 402 if user has reached their tier artwork limit."""
    from app.database.models import User as UserModel
    user = db.query(UserModel).filter(UserModel.user_id == user_id).first()
    tier = (user.tier if user else None) or "free"
    limit = get_quota(tier)
    if limit is None:
        return  # unlimited
    count = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).count()
    if count >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "quota_exceeded",
                "tier": tier,
                "limit": limit,
                "used": count,
                "message": f"You've reached the {tier} plan limit of {limit} artworks.",
            }
        )

# ── Skill name → category map (mirrors ArtSkillsView.tsx) ────────────────────
_SKILL_CAT: dict[str, str] = {
    "Color Tension": "PERCEPTION", "Compositional Pull": "PERCEPTION",
    "Materiality": "PERCEPTION", "Scale & Presence": "PERCEPTION", "Detail Hunter": "PERCEPTION",
    "Art Movement": "HISTORY", "Lineage": "HISTORY", "Historical Context": "HISTORY",
    "Collection & Market": "HISTORY", "Legacy": "HISTORY",
    "Life Traces": "INTENT", "Argument": "INTENT", "Obsession": "INTENT",
    "Ambition": "INTENT", "The Specific": "INTENT",
    "Hidden Mechanism": "STRUCTURE", "Contradiction": "STRUCTURE",
    "Absence & Silence": "STRUCTURE", "Controlled Looking": "STRUCTURE",
    "Temporality": "STRUCTURE", "Site": "STRUCTURE",
    "Personal Memory": "RESONANCE", "Gut Response": "RESONANCE",
    "Ethical Discomfort": "RESONANCE", "Wider Resonance": "RESONANCE", "Ineffable": "RESONANCE",
}

_IDENTITY_LABELS: dict[str | None, tuple[str, str]] = {
    "PERCEPTION": ("The Observer", "You see what others walk past."),
    "HISTORY":    ("The Historian", "You read works as documents of their time."),
    "INTENT":     ("The Interpreter", "You look for the mind behind the work."),
    "STRUCTURE":  ("The Analyst", "You find meaning in how things are made."),
    "RESONANCE":  ("The Empath", "Art reaches you before you can explain why."),
    None:         ("The Wanderer", "Your attention moves in all directions."),
}

def _xp_to_level(xp: int) -> int:
    if xp == 0:  return 0
    if xp < 4:   return 1
    if xp < 10:  return 2
    if xp < 20:  return 3
    if xp < 35:  return 4
    return 5

def _log_skill_event_sync(user_id: str, skill_name: str, skill_cat: str, event_type: str, artwork_id: Optional[str]):
    xp_gain = 1 if event_type == "observation" else 3
    with SessionLocal() as db:
        db.add(SkillEvent(user_id=user_id, artwork_id=artwork_id, skill_name=skill_name,
                          skill_cat=skill_cat, event_type=event_type))
        user = db.query(User).filter(User.user_id == user_id).first()
        if user:
            stats = dict(user.skill_stats or {})
            entry = dict(stats.get(skill_name, {"observations": 0, "deepdives": 0, "xp": 0}))
            entry[f"{event_type}s"] = entry.get(f"{event_type}s", 0) + 1
            entry["xp"] = entry.get("xp", 0) + xp_gain
            stats[skill_name] = entry
            user.skill_stats = stats
            db.commit()


# Initialize and register AI clients
def initialize_ai_services():
    """Initialize available AI clients based on configuration"""
    try:
        if settings.openai_api_key:
            power_model = settings.ai_model_power  # e.g. "gpt-5"
            fast_model = settings.ai_model_fast    # e.g. "gpt-5-mini"
            AIServiceFactory.register_client(AIProvider.OPENAI, OpenAIAPIClient(model=power_model))
            print(f"[AI] AI_MODEL_POWER = {power_model or '(unset, using default)'}")
            if fast_model:
                AIServiceFactory.register_fast_client(AIProvider.OPENAI, OpenAIAPIClient(model=fast_model))
                print(f"[AI] AI_MODEL_FAST  = {fast_model}")
            else:
                print(f"[AI] AI_MODEL_FAST  = (unset, falling back to power model)")
    except Exception as e:
        logger.error(f"Failed to initialize OpenAI: {e}")

    try:
        if settings.claude_api_key:
            AIServiceFactory.register_client(AIProvider.CLAUDE, ClaudeAPIClient())
            logger.info("Claude client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Claude: {e}")

    try:
        if settings.gemini_api_key:
            AIServiceFactory.register_client(AIProvider.GEMINI, GeminiAPIClient())
            logger.info("Gemini client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini: {e}")


# Initialize services on module load
initialize_ai_services()


def determine_ai_provider(requested_model: Optional[AIProvider] = None) -> AIProvider:
    """Determine which AI provider to use based on configuration and request."""
    available_providers = AIServiceFactory.get_available_providers()

    if not available_providers:
        raise HTTPException(
            status_code=503,
            detail="No AI services available. Please check configuration."
        )

    if requested_model and requested_model in available_providers:
        return requested_model

    try:
        default_provider = AIProvider(settings.ai_provider)
        if default_provider in available_providers:
            return default_provider
    except ValueError:
        pass

    return available_providers[0]


def normalize_tag_name(tag: str) -> str:
    """Normalize tag name to lowercase with # prefix"""
    normalized = tag.strip().lower()
    if not normalized.startswith('#'):
        normalized = f'#{normalized}'
    return normalized


def batch_link_tags(db: Session, artwork: SavedArtwork, tags_input: Union[str, List[str]]):
    """Link tags from a comma-separated string or list to an artwork (batch query)

    Tags are global (not user-specific). Creates new tags if they don't exist.
    """
    if not tags_input:
        return

    # Normalize all tag names
    if isinstance(tags_input, str):
        tag_names = [normalize_tag_name(t) for t in tags_input.split(',') if t.strip()]
    else:
        tag_names = [normalize_tag_name(t) for t in tags_input if t.strip()]
        
    if not tag_names:
        return

    # Batch query: get all existing tags at once
    existing_tags = db.query(Tag).filter(Tag.name.in_(tag_names)).all()
    existing_tag_map = {tag.name: tag for tag in existing_tags}

    # Get current associations
    current_tag_ids = {tag.id for tag in artwork.artwork_tags}

    # Create missing tags and link all
    for name in tag_names:
        if name in existing_tag_map:
            tag = existing_tag_map[name]
        else:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()

        if tag.id not in current_tag_ids:
            artwork.artwork_tags.append(tag)


# =============================================================================
# AI Analysis Endpoints (Stateless - no DB writes)
# =============================================================================

@router.post("/artwork-analyze")
async def analyze_artist(
    image: UploadFile = File(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Analyze artwork image to identify artist
    """
    ai_provider = determine_ai_provider(model)
    logger.info(f"analyze_artist received session_id: {session_id}, user_id: {user_id}")

    require_same_user(current_user, user_id)
    # Enforce artwork quota before any AI work
    if user_id and settings.use_database:
        check_artwork_quota(user_id, db)

    try:
        image_bytes, image_metadata = await process_image(image)

        # Determine location source (Priority: Client provided string > EXIF > Coordinate Resolution)
        if location:
            logger.info(f"Metadata Source [Location]: FRONTEND (Value: {location})")
        elif image_metadata.get("location_data"):
            location = json.dumps(image_metadata["location_data"])
            logger.info(f"Metadata Source [Location]: PHOTO EXIF (Resolved: {location})")
        elif latitude is not None and longitude is not None:
            # Frontend provided coordinates, but EXIF didn't have GPS or geocoding failed
            location_data = await reverse_geocode(latitude, longitude)
            location = json.dumps(location_data)
            logger.info(f"Metadata Source [Location]: FRONTEND COORDS (Resolved: {location})")
        else:
            logger.info(f"Metadata Source [Location]: NONE")
        
        # Determine time source
        if image_metadata.get("exif_timestamp"):
            photo_time = image_metadata["exif_timestamp"]
            logger.info(f"Metadata Source [Time]: PHOTO EXIF (Timestamp: {photo_time})")
        else:
            logger.info(f"Metadata Source [Time]: FRONTEND (Value: {photo_time})")

        ai_service = AIServiceFactory.get_service(ai_provider)

        # Vision hint + session context (used for identification only, not description)
        (vision_hint, vision_ref_urls), session_context = await asyncio.gather(
            get_vision_hint(image_bytes),
            get_session_context(session_id) if session_id else asyncio.sleep(0, result=None),
        )

        ai_service = AIServiceFactory.get_service(ai_provider)
        analysis_text = await ai_service.identify_artist(
            image_bytes, identity=identity, language=language,
            session_context=session_context, vision_hint=vision_hint,
        )

        response = {
            "analysis": None, # Will be filled after parsing
            "model_used": ai_provider.value
        }

        # If user_id provided, save to DB
        if user_id:
            # Parse analysis to extract artist/artwork info
            artist_name = "Unknown Artist"
            artwork_name = "Untitled"
            extracted_tags = []
            extracted_analysis = None
            date_val = None
            medium_val = None
            movement_val = None
            period_bucket_val = None

            try:
                import re
                json_str = analysis_text
                # Extract JSON from markdown code blocks if present
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', analysis_text)
                if json_match:
                    json_str = json_match.group(1).strip()

                parsed = json.loads(json_str)

                # Handle the new structured object format
                if isinstance(parsed, dict):
                    artist_name = parsed.get('artist', artist_name)
                    artwork_name = parsed.get('title', artwork_name)
                    extracted_tags = parsed.get('tags', [])
                    extracted_analysis = parsed.get('description', '')
                    date_val = parsed.get('date')
                    medium_val = parsed.get('medium')
                    movement_val = parsed.get('movement')
                    period_bucket_val = parsed.get('period_bucket')
            except Exception as e:
                logger.warning(f"Failed to parse analysis for DB save: {e}")

            # Fallback to full text if extraction failed
            if not extracted_analysis:
                extracted_analysis = analysis_text

            # Generate photo_uri based on client type
            if photo_uri:
                generated_photo_uri = photo_uri
            elif client_type == "web" or not photo_uri:
                storage = get_storage_service()
                generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
            else:
                import uuid as uuid_mod
                generated_photo_uri = f"artwork_{uuid_mod.uuid4().hex[:12]}"

            # Parse location JSON
            parsed_location = None
            if location and isinstance(location, str):
                try:
                    if location.strip().startswith('{'):
                         parsed_location = json.loads(location)
                    else:
                         parsed_location = {"raw": location}
                except:
                    parsed_location = {"raw": location}
            elif location:
                 parsed_location = location

            # Create artwork record in a thread-safe way
            def _save_artwork_sync(
                u_id, s_id, p_uri, a_name, w_name, e_analysis, d_val, m_val, loc, p_time, mv_val, pb_val, ref_urls
            ):
                with SessionLocal() as local_db:
                    # Ensure user exists
                    usr = local_db.query(User).filter(User.user_id == u_id).first()
                    if not usr:
                        usr = User(user_id=u_id, device_id=u_id)
                        local_db.add(usr)
                        local_db.flush()
                    
                    # Ensure session exists (Mandatory in Visit-Only Architecture)
                    if s_id:
                        sess_record = local_db.query(SessionModel).filter(SessionModel.id == s_id).first()
                        if not sess_record:
                            # Determine initial title from location
                            initial_title = "Personal Visit"
                            if loc:
                                try:
                                    loc_data = json.loads(loc) if isinstance(loc, str) else loc
                                    initial_title = loc_data.get("museum") or loc_data.get("city") or initial_title
                                except:
                                    pass

                            sess_record = SessionModel(
                                id=s_id,
                                user_id=u_id or "anonymous",
                                title=initial_title
                            )
                            local_db.add(sess_record)
                            local_db.flush()
                    
                    # Create artwork
                    art = SavedArtwork(
                        photo_uri=p_uri,
                        artist_name=a_name,
                        artwork_name=w_name,
                        user_id=u_id,
                        is_recognized=1 if a_name != "Unknown Artist" else 0,
                        analysis=e_analysis,
                        params={"date": d_val, "medium": m_val},
                        session_id=s_id,
                        location=loc,
                        photo_time=p_time,
                        movement=mv_val,
                        period_bucket=pb_val,
                        reference_urls=ref_urls or [],
                    )
                    local_db.add(art)
                    try:
                        local_db.commit()
                    except Exception as _col_err:
                        if "reference_urls" in str(_col_err):
                            local_db.rollback()
                            art.reference_urls = None
                            local_db.add(art)
                            local_db.commit()
                        else:
                            raise
                    local_db.refresh(art)
                    _ensure_session_artwork_link(
                        local_db,
                        session_id=s_id,
                        artwork_id=str(art.id),
                        source="upload",
                    )
                    local_db.commit()

                    # Link artwork entity and artist entity (non-fatal)
                    entity_id_for_analysis = None
                    artist_entity_id_for_bio = None
                    linked_artist_entity_id = None
                    if a_name and a_name != "Unknown Artist" and w_name:
                        try:
                            with local_db.begin_nested():
                                entity = upsert_artwork_entity(local_db, a_name, w_name)
                                artist_ent = upsert_artist_entity(local_db, a_name)
                                local_db.flush()
                                art.artwork_entity_id = entity.id
                                art.artist_entity_id = artist_ent.id
                            local_db.commit()
                            linked_artist_entity_id = artist_ent.id
                            if entity.dim_status in (None, "pending"):
                                entity_id_for_analysis = entity.id
                            if artist_ent.bio_status in (None, "pending"):
                                artist_entity_id_for_bio = artist_ent.id
                        except Exception as _e:
                            logger.warning("Entity upsert failed in stream save: %s", _e)

                    return str(art.id), entity_id_for_analysis, artist_entity_id_for_bio, linked_artist_entity_id

            result = await anyio.to_thread.run_sync(
                _save_artwork_sync,
                user_id,
                session_id,
                generated_photo_uri,
                artist_name,
                artwork_name,
                extracted_analysis,
                date_val,
                medium_val,
                parsed_location,
                photo_time,
                movement_val,
                period_bucket_val,
                vision_ref_urls,
            )
            if isinstance(result, tuple) and len(result) == 4:
                artwork_id, _entity_id_fast, _artist_entity_id_fast, _linked_artist_entity_id = result
            elif isinstance(result, tuple) and len(result) == 3:
                artwork_id, _entity_id_fast, _artist_entity_id_fast = result; _linked_artist_entity_id = _artist_entity_id_fast
            elif isinstance(result, tuple):
                artwork_id, _entity_id_fast = result; _artist_entity_id_fast = _linked_artist_entity_id = None
            else:
                artwork_id = result; _entity_id_fast = _artist_entity_id_fast = _linked_artist_entity_id = None
            if _entity_id_fast and background_tasks:
                background_tasks.add_task(_run_dimension_analysis_bg, _entity_id_fast)
            if _artist_entity_id_fast and background_tasks:
                background_tasks.add_task(_run_artist_bio_bg, _artist_entity_id_fast)
            if artwork_id and artist_name and artist_name != "Unknown Artist":
                _ui = asyncio.create_task(_do_insights(artwork_id, artist_name, artwork_name, language))
                _active_tasks.add(_ui)
                _ui.add_done_callback(_active_tasks.discard)

            # Update session narrative in background
            if session_id and background_tasks:
                background_tasks.add_task(
                    update_session_narrative_task,
                    session_id=session_id,
                    new_artwork_data={
                        "artist": artist_name,
                        "title": artwork_name,
                        "description": extracted_analysis
                    },
                    identity=identity,
                    language=language
                )

            response["artwork_id"] = artwork_id
            response["artist_name"] = artist_name
            response["artwork_name"] = artwork_name
            response["photo_uri"] = generated_photo_uri  # For web clients, this is the server path
            response["date"] = date_val
            response["medium"] = medium_val
            response["location"] = location
            response["photo_time"] = photo_time
            response["tags"] = extracted_tags
            response["analysis"] = extracted_analysis
            response["artist_entity_id"] = _linked_artist_entity_id
        else:
            # If not saving to DB, still try to parse for cleaner response
            extracted_analysis = None
            try:
                import re
                json_str = analysis_text
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', analysis_text)
                if json_match:
                    json_str = json_match.group(1).strip()
                parsed = json.loads(json_str)
                if isinstance(parsed, dict):
                    extracted_analysis = parsed.get('description')
            except:
                pass
            
            response["analysis"] = extracted_analysis or analysis_text

        return response

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        logger.error(f"Error in analyze_artist: {str(e)}", exc_info=True)
        db.rollback()
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/artwork-analyze-stream")
async def analyze_artist_stream(
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    reasoning_effort: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """
    Stream artwork analysis with SSE (Server-Sent Events)
    """
    # TIMING: Request received
    t_request_received = time.time()
    request_id = f"stream_{int(t_request_received * 1000)}"

    ai_provider = determine_ai_provider(model)

    # Quota check — only when DB is enabled
    if user_id and settings.use_database:
        check_artwork_quota(user_id, db)

    try:
        if image and image.filename:
            image_bytes, image_metadata = await process_image(image)
            if not location:
                if image_metadata.get("location_data"):
                    location = json.dumps(image_metadata["location_data"])
                    logger.info(f"Metadata Source [Streaming Location]: PHOTO EXIF (Resolved: {location})")
                elif latitude is not None and longitude is not None:
                    location_data = await reverse_geocode(latitude, longitude)
                    location = json.dumps(location_data)
                    logger.info(f"Metadata Source [Streaming Location]: FRONTEND COORDS (Resolved: {location})")
                else:
                    logger.info(f"Metadata Source [Streaming Location]: NONE")
            if image_metadata.get("exif_timestamp") and not photo_time:
                photo_time = image_metadata["exif_timestamp"]
                logger.info(f"Metadata Source [Streaming Time]: PHOTO EXIF (Timestamp: {photo_time})")
        elif photo_uri:
            image_bytes = await _resolve_image_bytes(None, photo_uri)
            logger.info(f"Analyze stream: loaded image from photo_uri={photo_uri[:60]}…")
        else:
            raise HTTPException(status_code=400, detail="Either image or photo_uri is required")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {str(e)}")

    # TIMING: Image processed
    t_image_processed = time.time()

    # Queue for passing SSE events from analysis task to SSE generator.
    # Unbounded — put() never blocks, so the analysis task runs unimpeded
    # even after the client disconnects and nobody is consuming events.
    queue: asyncio.Queue = asyncio.Queue()

    async def _analyze_task() -> None:
        """Full LLM + R2 + DB pipeline. Runs as an independent asyncio.Task so it
        completes even when the client disconnects mid-stream."""
        full_text = ""
        ai_service = AIServiceFactory.get_service(ai_provider)
        t_ai_call = t_first_chunk = t_streaming_done = None
        first_chunk_received = False
        generated_photo_uri: Optional[str] = None

        try:
            t_ai_call = time.time()

            # Vision hint + session context (used for identification only, not description)
            (vision_hint, vision_ref_urls), session_context = await asyncio.gather(
                get_vision_hint(image_bytes),
                get_session_context(session_id) if session_id else asyncio.sleep(0, result=None),
            )

            async for chunk in ai_service.identify_artist_stream(
                image_bytes, identity=identity, language=language,
                session_context=session_context, reasoning_effort=reasoning_effort,
                vision_hint=vision_hint,
            ):
                if not first_chunk_received:
                    t_first_chunk = time.time()
                    first_chunk_received = True

                full_text += chunk
                event_data = json.dumps({"type": "text", "content": chunk})
                await queue.put(f"event: chunk\ndata: {event_data}\n\n")

            t_streaming_done = time.time()

            # ── Parse LLM output ────────────────────────────────────────────
            artist_name = "Unknown Artist"
            artwork_name = "Untitled"
            extracted_tags: list = []
            description = ""
            date_val = medium_val = movement_val = period_bucket_val = None

            try:
                json_str = full_text
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', full_text)
                if json_match:
                    json_str = json_match.group(1).strip()
                parsed = json.loads(json_str)
                if isinstance(parsed, dict):
                    artist_name  = parsed.get('artist', artist_name)
                    artwork_name = parsed.get('title', artwork_name)
                    extracted_tags = parsed.get('tags', [])
                    description    = parsed.get('description', '')
                    date_val       = parsed.get('date')
                    medium_val     = parsed.get('medium')
                    movement_val   = parsed.get('movement')
                    period_bucket_val = parsed.get('period_bucket')
                elif isinstance(parsed, list) and parsed:
                    artist_info = next(
                        (i for i in parsed if isinstance(i, dict) and 'artist_name' in i),
                        parsed[0] if isinstance(parsed[0], dict) else {}
                    )
                    analysis_info = next(
                        (i for i in parsed if isinstance(i, dict) and 'analysis' in i), {}
                    )
                    artist_name    = artist_info.get('artist_name', artist_name)
                    artwork_name   = artist_info.get('artwork_name', artwork_name)
                    extracted_tags = analysis_info.get('tags', [])
                    description    = analysis_info.get('analysis', '')
                    date_val       = artist_info.get('date') or analysis_info.get('date')
                    medium_val     = artist_info.get('medium') or analysis_info.get('medium')
                logger.info(f"[{request_id}] Parsed: {artist_name} — {artwork_name}")
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as _pe:
                logger.warning(f"[{request_id}] Parse failed: {_pe}")

            result = {
                "type": "result",
                "artist_name": artist_name,
                "artwork_name": artwork_name,
                "date": date_val,
                "medium": medium_val,
                "movement": movement_val,
                "period_bucket": period_bucket_val,
                "description": description,
                "tags": extracted_tags,
                "analysis": description or full_text,
                "model_used": ai_provider.value,
                "location": location,
                "photo_time": photo_time,
            }

            # ── Upload image to R2 ──────────────────────────────────────────
            if photo_uri:
                generated_photo_uri = photo_uri
            elif client_type == "web":
                storage = get_storage_service()
                generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
            else:
                import uuid as uuid_mod
                generated_photo_uri = f"artwork_{uuid_mod.uuid4().hex[:12]}"

            # ── Parse location ──────────────────────────────────────────────
            parsed_location = None
            if location and isinstance(location, str):
                try:
                    parsed_location = json.loads(location) if location.strip().startswith('{') else {"raw": location}
                except Exception:
                    parsed_location = {"raw": location}
            elif location:
                parsed_location = location

            # ── Save to DB ──────────────────────────────────────────────────
            def _save_streaming_artwork_sync(
                u_id, s_id, p_uri, a_name, w_name, desc, full_txt,
                d_val, m_val, tags, loc, p_time, mv_val, pb_val, ref_urls
            ):
                with SessionLocal() as local_db:
                    usr = local_db.query(User).filter(User.user_id == u_id).first()
                    if not usr:
                        local_db.add(User(user_id=u_id, device_id=u_id))
                        local_db.flush()

                    if s_id and not local_db.query(SessionModel).filter(SessionModel.id == s_id).first():
                        initial_title = "Personal Visit"
                        if loc:
                            try:
                                loc_data = json.loads(loc) if isinstance(loc, str) else loc
                                initial_title = loc_data.get("museum") or loc_data.get("city") or initial_title
                            except Exception:
                                pass
                        local_db.add(SessionModel(id=s_id, user_id=u_id or "anonymous", title=initial_title))
                        local_db.flush()

                    art = SavedArtwork(
                        photo_uri=p_uri, artist_name=a_name, artwork_name=w_name,
                        user_id=u_id, is_recognized=1 if a_name != "Unknown Artist" else 0,
                        analysis=desc or full_txt, params={"date": d_val, "medium": m_val},
                        session_id=s_id, location=loc, photo_time=p_time,
                        movement=mv_val, period_bucket=pb_val, reference_urls=ref_urls or [],
                    )
                    local_db.add(art)
                    try:
                        local_db.flush()
                    except Exception as _col_err:
                        if "reference_urls" in str(_col_err):
                            local_db.rollback()
                            art.reference_urls = None
                            local_db.add(art)
                            local_db.flush()
                        else:
                            raise

                    if tags:
                        batch_link_tags(local_db, art, tags)

                    local_db.commit()
                    local_db.refresh(art)
                    _ensure_session_artwork_link(
                        local_db,
                        session_id=s_id,
                        artwork_id=str(art.id),
                        source="upload",
                    )
                    local_db.commit()

                    entity_id_for_analysis = None
                    artist_entity_id_for_bio = None
                    linked_artist_entity_id = None
                    if a_name and a_name != "Unknown Artist" and w_name:
                        try:
                            with local_db.begin_nested():
                                entity = upsert_artwork_entity(local_db, a_name, w_name)
                                artist_ent = upsert_artist_entity(local_db, a_name)
                                local_db.flush()
                                art.artwork_entity_id = entity.id
                                art.artist_entity_id = artist_ent.id
                            local_db.commit()
                            linked_artist_entity_id = artist_ent.id
                            if entity.dim_status in (None, "pending"):
                                entity_id_for_analysis = entity.id
                            if artist_ent.bio_status in (None, "pending"):
                                artist_entity_id_for_bio = artist_ent.id
                        except Exception as _e:
                            logger.warning("Entity upsert failed: %s", _e)

                    return str(art.id), entity_id_for_analysis, artist_entity_id_for_bio, linked_artist_entity_id

            try:
                _stream_result = await anyio.to_thread.run_sync(
                    _save_streaming_artwork_sync,
                    user_id, session_id, generated_photo_uri,
                    artist_name, artwork_name, description, full_text,
                    date_val, medium_val, extracted_tags, parsed_location,
                    photo_time, movement_val, period_bucket_val, vision_ref_urls,
                )
            except Exception as _db_err:
                # DB write failed after R2 upload — try to clean up the orphaned image
                if generated_photo_uri and client_type == "web" and not photo_uri:
                    try:
                        await get_storage_service().delete(generated_photo_uri)
                    except Exception:
                        pass
                raise _db_err

            if isinstance(_stream_result, tuple) and len(_stream_result) == 4:
                artwork_id, _entity_id, _artist_entity_id, _linked_artist_entity_id = _stream_result
            elif isinstance(_stream_result, tuple) and len(_stream_result) == 3:
                artwork_id, _entity_id, _artist_entity_id = _stream_result; _linked_artist_entity_id = _artist_entity_id
            elif isinstance(_stream_result, tuple):
                artwork_id, _entity_id = _stream_result; _artist_entity_id = _linked_artist_entity_id = None
            else:
                artwork_id = _stream_result; _entity_id = _artist_entity_id = _linked_artist_entity_id = None

            # Fire-and-forget background work as independent tasks (survive disconnect)
            if _entity_id:
                _bg = asyncio.create_task(_do_dimension_analysis(_entity_id))
                _active_tasks.add(_bg)
                _bg.add_done_callback(_active_tasks.discard)
            if _artist_entity_id:
                _ab = asyncio.create_task(_do_artist_bio(_artist_entity_id))
                _active_tasks.add(_ab)
                _ab.add_done_callback(_active_tasks.discard)
            if artist_name and artist_name != "Unknown Artist":
                _up = asyncio.create_task(_do_insights(artwork_id, artist_name, artwork_name, language))
                _active_tasks.add(_up)
                _up.add_done_callback(_active_tasks.discard)
            if session_id:
                _sn = asyncio.create_task(update_session_narrative_task(
                    session_id=session_id,
                    new_artwork_data={"artist": artist_name, "title": artwork_name, "description": description or full_text},
                    identity=identity, language=language,
                ))
                _active_tasks.add(_sn)
                _sn.add_done_callback(_active_tasks.discard)

            result["artwork_id"] = artwork_id
            result["photo_uri"] = generated_photo_uri
            result["reference_urls"] = vision_ref_urls
            result["artist_entity_id"] = _linked_artist_entity_id

            # ── Metrics ─────────────────────────────────────────────────────
            t_done = time.time()
            metrics = {
                "type": "metrics",
                "request_id": request_id,
                "timings": {
                    "image_processing_ms": round((t_image_processed - t_request_received) * 1000),
                    "time_to_ai_call_ms": round((t_ai_call - t_request_received) * 1000) if t_ai_call else None,
                    "time_to_first_chunk_ms": round((t_first_chunk - t_request_received) * 1000) if t_first_chunk else None,
                    "ai_first_chunk_latency_ms": round((t_first_chunk - t_ai_call) * 1000) if t_first_chunk and t_ai_call else None,
                    "streaming_duration_ms": round((t_streaming_done - t_first_chunk) * 1000) if t_streaming_done and t_first_chunk else None,
                    "total_duration_ms": round((t_done - t_request_received) * 1000),
                },
                "model": ai_provider.value,
            }
            logger.info(f"[{request_id}] METRIC_SUMMARY: {json.dumps(metrics['timings'])}")
            await queue.put(f"event: metrics\ndata: {json.dumps(metrics)}\n\n")
            await queue.put(f"event: complete\ndata: {json.dumps(result)}\n\n")

        except Exception as e:
            logger.error(f"[{request_id}] Streaming error: {e}", exc_info=True)
            await queue.put(f"event: error\ndata: {json.dumps({'type': 'error', 'message': str(e)})}\n\n")
        finally:
            await queue.put(None)  # sentinel — tells event_generator to stop

    # Start the analysis as an independent task. It will run to completion
    # even if the SSE client disconnects mid-stream.
    _task = asyncio.create_task(_analyze_task())
    _active_tasks.add(_task)
    _task.add_done_callback(_active_tasks.discard)

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield event
        except (asyncio.CancelledError, Exception):
            # Client disconnected — _analyze_task keeps running independently.
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/artwork-chat")
async def analyze_bite(
    query: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    artist_name: Optional[str] = Form(None),
    artwork_name: Optional[str] = Form(None),
    conversation_history: Optional[str] = Form(None),
    artwork_id: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Get artwork insight based on query and context

    Two modes:
    1. **artwork_id mode**: Pass artwork_id to read history from DB and persist messages
    2. **stateless mode**: Pass conversation_history as JSON (no DB writes)

    - **query**: User's question
    - **image**: Image file (optional)
    - **artist_name**: Artist name (used in stateless mode or as override)
    - **artwork_name**: Artwork name (used in stateless mode or as override)
    - **artwork_id**: If provided, reads/writes conversation from/to DB
    - **conversation_history**: JSON array of [{role, content}, ...] for stateless mode
    - **model**: AI model preference
    - **identity**: AI persona
    - **language**: Response language
    """
    ai_provider = determine_ai_provider(model)

    try:
        user_message = query or "Tell me more about this artwork."
        session_id = None

        # Fail if both image and artwork_id are missing
        if not image and not artwork_id:
            raise HTTPException(
                status_code=400, 
                detail="Must provide either an image or an artwork_id (session context)"
            )

        image_bytes = None
        if image:
            image_bytes, image_metadata = await process_image(image)
            
            # Optionally override if needed
            if image_metadata.get("exif_location"):
                location = json.dumps(image_metadata["exif_location"])
            if image_metadata.get("exif_timestamp"):
                photo_time = image_metadata["exif_timestamp"]

        previous_messages = []
        artwork = None
        user_msg_record = None

        # Mode 1: artwork_id provided - use DB for conversation history
        if artwork_id:
            artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
            if not artwork:
                raise HTTPException(status_code=404, detail="Artwork not found")

            # Use artwork's artist/artwork names unless overridden
            if not artist_name:
                artist_name = artwork.artist_name
            if not artwork_name:
                artwork_name = artwork.artwork_name

            # Use artwork's session_id if not explicitly provided
            if artwork.session_id:
                session_id = artwork.session_id
                logger.info(f"Inferred session_id {session_id} from artwork_id {artwork_id}")

            # Load conversation history from DB
            conversations = db.query(Conversation).filter(
                Conversation.saved_artwork_id == artwork_id
            ).order_by(Conversation.sequence_number).all()

            previous_messages = [
                ConversationMessage(role=c.role, content=c.content)
                for c in conversations
            ]

            # Load image from storage if not provided in request
            if not image_bytes and artwork.photo_uri:
                try:
                    # Find the appropriate storage service for this URI
                    storage = StorageFactory.get_service_for_uri(artwork.photo_uri)
                    if storage:
                        image_bytes = await storage.load(artwork.photo_uri)
                        logger.info(f"Loaded image from storage: {artwork.photo_uri}")
                    else:
                        # For iOS local paths, we can't load on server
                        logger.warning(f"Cannot load image - no storage handler for URI: {artwork.photo_uri}")
                except Exception as e:
                    logger.error(f"Failed to load image from storage {artwork.photo_uri}: {e}")

            # Get next sequence number (most robust way)
            max_seq = db.query(func.max(Conversation.sequence_number)).filter(
                Conversation.saved_artwork_id == artwork_id
            ).scalar()
            next_seq = (max_seq + 1) if max_seq is not None else 0

            # Write user message to DB FIRST (before LLM call)
            user_msg_record = Conversation(
                saved_artwork_id=artwork_id,
                sequence_number=next_seq,
                role="user",
                content=user_message
            )
            db.add(user_msg_record)
            db.flush()  # Persist user message immediately

        # Mode 2: stateless mode - parse conversation_history from JSON
        elif conversation_history:
            try:
                conv_data = json.loads(conversation_history)
                previous_messages = [
                    ConversationMessage(role=msg.get('role', 'user'), content=msg.get('content', ''))
                    for msg in conv_data if msg.get('content')
                ]
            except json.JSONDecodeError:
                logger.warning("Failed to parse conversation_history JSON")

        # Get session context if session_id provided
        session_context = None
        if session_id:
            session_context = await get_session_context(session_id)

        # Call LLM
        ai_service = AIServiceFactory.get_service(ai_provider)
        bite_text = await ai_service.get_artwork_bite(
            image_bytes,
            artist_name or "Unknown Artist",
            artwork_name or "Unknown",
            user_message,
            previous_messages,
            identity=identity,
            language=language,
            session_context=session_context
        )

        # If artwork_id mode, write assistant message to DB
        if artwork_id and artwork:
            next_seq = (user_msg_record.sequence_number + 1) if user_msg_record else len(previous_messages)
            assistant_msg_record = Conversation(
                saved_artwork_id=artwork_id,
                sequence_number=next_seq,
                role="assistant",
                content=bite_text
            )
            db.add(assistant_msg_record)
            db.commit()

        return {
            "response": bite_text,
            "query": query,
            "model_used": ai_provider.value,
            "artwork_id": artwork_id
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/artwork-chat-stream")
async def analyze_bite_stream(
    query: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    artist_name: Optional[str] = Form(None),
    artwork_name: Optional[str] = Form(None),
    conversation_history: Optional[str] = Form(None),
    artwork_id: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Stream artwork insight based on query and context using SSE
    """
    ai_provider = determine_ai_provider(model)

    try:
        user_message = query or "Tell me more about this artwork."
        session_id = None

        if not image and not artwork_id:
            raise HTTPException(
                status_code=400, 
                detail="Must provide either an image or an artwork_id (session context)"
            )

        image_bytes = None
        if image:
            image_bytes, image_metadata = await process_image(image)
            
            # Optionally override if needed
            if image_metadata.get("exif_location"):
                location = json.dumps(image_metadata["exif_location"])
            if image_metadata.get("exif_timestamp"):
                photo_time = image_metadata["exif_timestamp"]

        previous_messages = []
        artwork = None
        user_msg_record = None

        # Mode 1: artwork_id provided - use DB for conversation history
        if artwork_id:
            artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
            if not artwork:
                raise HTTPException(status_code=404, detail="Artwork not found")

            if not artist_name:
                artist_name = artwork.artist_name
            if not artwork_name:
                artwork_name = artwork.artwork_name

            # Use artwork's session_id if not explicitly provided
            if not session_id and artwork.session_id:
                session_id = artwork.session_id
                logger.info(f"Inferred session_id {session_id} from artwork_id {artwork_id}")

            conversations = db.query(Conversation).filter(
                Conversation.saved_artwork_id == artwork_id
            ).order_by(Conversation.sequence_number).all()

            previous_messages = [
                ConversationMessage(role=c.role, content=c.content)
                for c in conversations
            ]

            if not image_bytes and artwork.photo_uri:
                try:
                    storage = StorageFactory.get_service_for_uri(artwork.photo_uri)
                    if storage:
                        image_bytes = await storage.load(artwork.photo_uri)
                except Exception as e:
                    logger.error(f"Failed to load image: {e}")

            # Get next sequence number (most robust way)
            max_seq = db.query(func.max(Conversation.sequence_number)).filter(
                Conversation.saved_artwork_id == artwork_id
            ).scalar()
            next_seq = (max_seq + 1) if max_seq is not None else 0
            user_msg_record = Conversation(
                saved_artwork_id=artwork_id,
                sequence_number=next_seq,
                role="user",
                content=user_message
            )
            db.add(user_msg_record)
            db.commit()  # Commit user message immediately so it's visible to other sessions
            db.refresh(user_msg_record) # Ensure we have the latest state for sequence number

        # Mode 2: stateless mode
        elif conversation_history:
            try:
                conv_data = json.loads(conversation_history)
                previous_messages = [
                    ConversationMessage(role=msg.get('role', 'user'), content=msg.get('content', ''))
                    for msg in conv_data if msg.get('content')
                ]
            except json.JSONDecodeError:
                pass

        # Get session context if session_id provided
        session_context = None
        if session_id:
            session_context = await get_session_context(session_id)

        async def event_generator():
            nonlocal user_message, artist_name, artwork_name, previous_messages, identity, language, ai_provider, artwork_id, user_msg_record, session_context

            full_text = ""
            ai_service = AIServiceFactory.get_service(ai_provider)

            try:
                async for chunk in ai_service.get_artwork_bite_stream(
                    image_bytes,
                    artist_name or "Unknown Artist",
                    artwork_name or "Unknown",
                    user_message,
                    previous_messages,
                    identity=identity,
                    language=language,
                    session_context=session_context
                ):
                    full_text += chunk
                    yield f"event: chunk\ndata: {json.dumps({'type': 'text', 'content': chunk})}\n\n"

                # If artwork_id mode, write assistant message to DB
                if artwork_id:
                    # Create a new session for the background task to avoid issues with the main request session
                    from app.database.connection import SessionLocal
                    with SessionLocal() as background_db:
                        next_seq = (user_msg_record.sequence_number + 1) if user_msg_record else len(previous_messages)
                        assistant_msg_record = Conversation(
                            saved_artwork_id=artwork_id,
                            sequence_number=next_seq,
                            role="assistant",
                            content=full_text
                        )
                        background_db.add(assistant_msg_record)
                        background_db.commit()

                # Send completion event
                yield f"event: complete\ndata: {json.dumps({'type': 'result', 'response': full_text, 'model_used': ai_provider.value})}\n\n"

            except Exception as e:
                logger.error(f"Streaming chat error: {str(e)}", exc_info=True)
                yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in analyze_bite_stream: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggest-topic")
async def suggest_topic(
    artist_name: str = Form(...),
    artwork_name: str = Form(...),
    conversation_history: str = Form(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None)
):
    """
    Suggest next exploration topics (stateless)

    - **artist_name**: Artist name
    - **artwork_name**: Artwork name
    - **conversation_history**: JSON array of previous messages
    - **model**: AI model preference
    - **identity**: AI persona
    - **language**: Response language
    """
    ai_provider = determine_ai_provider(model)
    DEFAULT_TOPIC = "default topic"

    try:
        # Parse conversation history
        try:
            conv_data = json.loads(conversation_history)
            previous_insights = [
                msg.get('content', '')
                for msg in conv_data
                if msg.get('role') == 'assistant' and msg.get('content')
            ]
        except json.JSONDecodeError:
            return {"suggested_topics": [DEFAULT_TOPIC], "error": "Invalid conversation history"}

        if not previous_insights:
            return {"suggested_topics": [DEFAULT_TOPIC]}

        ai_service = AIServiceFactory.get_service(ai_provider)
        suggested_topics = await ai_service.suggest_topics(
            artist_name,
            artwork_name,
            previous_insights,
            identity=identity,
            language=language
        )

        return {
            "suggested_topics": suggested_topics,
            "model_used": ai_provider.value
        }

    except Exception as e:
        logger.error(f"Topic suggestion failed: {str(e)}")
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Topic suggestion failed: {str(e)}")


@router.post("/generate-summary")
async def generate_summary(
    image: UploadFile = File(...),
    artist_name: str = Form(...),
    artwork_name: str = Form(...),
    conversation_history: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None)
):
    """
    Generate a one-sentence summary (stateless)

    - **image**: Image file
    - **artist_name**: Artist name
    - **artwork_name**: Artwork name
    - **conversation_history**: JSON array of previous messages (optional)
    - **model**: AI model preference
    - **identity**: AI persona
    - **language**: Response language
    """
    ai_provider = determine_ai_provider(model)

    try:
        image_bytes, _ = await process_image(image)

        # Parse conversation history
        conv_messages = []
        if conversation_history:
            try:
                conv_data = json.loads(conversation_history)
                conv_messages = [
                    ConversationMessage(role=msg.get('role', 'user'), content=msg.get('content', ''))
                    for msg in conv_data if msg.get('content')
                ]
            except json.JSONDecodeError:
                pass

        ai_service = AIServiceFactory.get_service(ai_provider)
        summary = await ai_service.generate_summary(
            image_bytes,
            artist_name,
            artwork_name,
            conv_messages,
            identity=identity,
            language=language
        )

        return {
            "summary": summary,
            "model_used": ai_provider.value
        }

    except Exception as e:
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")


# =============================================================================
# Metadata Enrichment Endpoint
# =============================================================================

@router.post("/artworks/enrich-metadata")
async def enrich_artwork_metadata(
    user_id: str = Form(...),
    batch_size: int = Form(50),
    db: Session = Depends(get_db)
):
    """
    Fill movement + period_bucket for existing artworks where these fields are null.
    Uses AI text-only call (no image) against existing analysis text.
    Safe to call multiple times — only processes artworks with null movement.
    """
    from app.utils.prompt_loader import get_movement_names

    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.user_id == user_id,
        SavedArtwork.movement == None,
        SavedArtwork.analysis != None,
    ).limit(batch_size).all()

    if not artworks:
        return {"enriched": 0, "message": "No artworks need enrichment"}

    ai_service = AIServiceFactory.get_service()
    movement_names = get_movement_names()

    enrich_prompt = f"""Given this artwork analysis text, identify:
1. movement: the single closest art movement from this canonical list — {movement_names}. Use "Unknown" only if nothing fits.
2. period_bucket: one of "Historical" (pre-1900), "Modern" (1900-1970), "Contemporary" (1970-2010), "Now" (2010-present)

Respond with ONLY valid JSON: {{"movement": "...", "period_bucket": "..."}}

Analysis:
{{analysis}}"""

    enriched_count = 0
    for artwork in artworks:
        try:
            prompt = enrich_prompt.replace("{analysis}", (artwork.analysis or "")[:1000])
            response = await ai_service.ai_client.call_text_only(
                prompt=prompt,
                max_tokens=100,
                temperature=0.1,
            )
            import re as _re
            json_match = _re.search(r'\{[^}]+\}', response)
            if json_match:
                parsed = json.loads(json_match.group())
                artwork.movement = parsed.get("movement")
                artwork.period_bucket = parsed.get("period_bucket")
                enriched_count += 1
        except Exception as e:
            logger.warning(f"Enrichment failed for artwork {artwork.id}: {e}")
            continue

    db.commit()
    return {"enriched": enriched_count, "total_processed": len(artworks)}


# =============================================================================
# Configuration Endpoints
# =============================================================================

@router.get("/providers")
async def get_available_providers():
    """Get list of available AI providers"""
    providers = AIServiceFactory.get_available_providers()
    return {
        "available_providers": [p.value for p in providers],
        "default_provider": settings.ai_provider,
        "total": len(providers)
    }


@router.get("/identities")
async def get_available_identities():
    """Get list of available AI identities/personas"""
    from app.utils.prompt_loader import get_available_identities, get_available_instructions

    return {
        "available_identities": get_available_identities(),
        "available_instructions": get_available_instructions(),
        "default_identities": {
            "artist_identification": "museum_narrator",
            "artwork_bite": "art_historian",
            "suggest_topics": "art_historian"
        }
    }


# =============================================================================
# Image Processing Endpoints
# =============================================================================

@router.post("/remove-background")
async def remove_background(image: UploadFile = File(...)):
    """Remove background from an image using PhotoRoom API"""
    try:
        image_data = await image.read()
        result_image = await photoroom_service.remove_background(image_data)

        if not result_image:
            raise HTTPException(status_code=500, detail="Failed to remove background")

        return Response(
            content=result_image,
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=no-background.png"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {str(e)}")


# =============================================================================
# Web-client AI endpoints (visit chat works with all providers; define term & TTS are Gemini-only)
# =============================================================================

class ExhibitionItem(BaseModel):
    id: str
    url: str
    keywords: List[str] = []
    artist_name: Optional[str] = None
    artwork_name: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    medium: Optional[str] = None

class VisitChatRequest(BaseModel):
    items: List[ExhibitionItem]
    conversation_history: List[Dict[str, str]]  # [{role, content}]
    new_message: str




class UpdateSessionRequest(BaseModel):
    title: str


class CreateSessionRequest(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None


class AttachSessionArtworksRequest(BaseModel):
    artwork_ids: List[str]

async def _image_url_to_bytes(url: str) -> Optional[bytes]:
    """Return image bytes from data URL or HTTP URL, or None on failure."""
    if not url:
        return None
    if url.startswith("data:"):
        try:
            i = url.find(",")
            if i == -1:
                return None
            return base64.b64decode(url[i + 1 :])
        except Exception:
            return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            return r.content
    except Exception:
        return None


def _parse_identify_result(
    analysis_text: str,
    fallback_artist: str = "Unknown Artist",
    fallback_title: str = "Untitled",
) -> Dict[str, Any]:
    artist_name = fallback_artist
    artwork_name = fallback_title
    extracted_tags: List[str] = []
    extracted_analysis: Optional[str] = None
    date_val = None
    medium_val = None
    movement_val = None
    period_bucket_val = None

    try:
        json_str = analysis_text
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', analysis_text)
        if json_match:
            json_str = json_match.group(1).strip()
        parsed = json.loads(json_str)
        if isinstance(parsed, dict):
            artist_name = parsed.get("artist", artist_name)
            artwork_name = parsed.get("title", artwork_name)
            extracted_tags = parsed.get("tags", [])
            extracted_analysis = parsed.get("description", "")
            date_val = parsed.get("date")
            medium_val = parsed.get("medium")
            movement_val = parsed.get("movement")
            period_bucket_val = parsed.get("period_bucket")
    except Exception as e:
        logger.warning(f"Failed to parse analysis payload: {e}")

    if not extracted_analysis:
        extracted_analysis = analysis_text

    return {
        "artist_name": artist_name,
        "artwork_name": artwork_name,
        "tags": extracted_tags,
        "analysis": extracted_analysis,
        "date": date_val,
        "medium": medium_val,
        "movement": movement_val,
        "period_bucket": period_bucket_val,
    }


def _apply_authoritative_identity(
    parsed_result: Dict[str, Any],
    explicit_artist_name: Optional[str],
    explicit_artwork_name: Optional[str],
) -> Dict[str, Any]:
    result = dict(parsed_result)
    if explicit_artist_name and explicit_artist_name.strip():
        result["artist_name"] = explicit_artist_name.strip()
    if explicit_artwork_name and explicit_artwork_name.strip():
        result["artwork_name"] = explicit_artwork_name.strip()
    return result

async def _resolve_image_bytes(image: Optional[UploadFile], photo_uri: Optional[str]) -> bytes:
    """Load image bytes from an uploaded file or URI, raising 400 if neither works."""
    image_bytes = None
    if image and image.filename:
        content = await image.read()
        if content:
            image_bytes = content
    if not image_bytes and photo_uri:
        image_bytes = await _image_url_to_bytes(photo_uri)
        if not image_bytes:
            try:
                storage = StorageFactory.get_service_for_uri(photo_uri)
                if storage:
                    image_bytes = await storage.load(photo_uri)
            except Exception as e:
                logger.warning(f"Could not load image from storage: {e}")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="No image provided or loadable")
    return compress_for_ai(image_bytes)


@router.post("/artwork-explore-skills")
async def artwork_explore_skills(
    photo_uri: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    language: Optional[str] = Form(None),
    artist_name: Optional[str] = Form(None),
    artwork_name: Optional[str] = Form(None),
):
    """Select 3 observation skill angles for an artwork (Interactive Explore mode)."""
    ai_provider = determine_ai_provider(model)
    image_bytes = await _resolve_image_bytes(image, photo_uri)
    try:
        ai_service = AIServiceFactory.get_fast_service(ai_provider)
        skills = await ai_service.select_explore_skills(
            image_bytes, language=language,
            artist_name=artist_name or None,
            artwork_name=artwork_name or None,
        )
        return {"skills": skills}
    except Exception as e:
        logger.error(f"artwork-explore-skills error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/artwork-skill-observation")
async def artwork_skill_observation(
    skill_name: str = Form(...),
    skill_desc: str = Form(...),
    prev_observations: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    artwork_id: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None,
):
    """Get one observation for a given skill (Interactive Explore mode)."""
    ai_provider = determine_ai_provider(model)
    image_bytes = await _resolve_image_bytes(image, photo_uri)
    prev = json.loads(prev_observations) if prev_observations else []
    try:
        ai_service = AIServiceFactory.get_fast_service(ai_provider)
        observation = await ai_service.get_skill_observation(
            image_bytes, skill_name, skill_desc, prev_observations=prev, language=language
        )
        if user_id and prev == []:  # only log the first observation per skill per session
            skill_cat = _SKILL_CAT.get(skill_name, "STRUCTURE")
            if background_tasks:
                background_tasks.add_task(_log_skill_event_sync, user_id, skill_name, skill_cat, "observation", artwork_id)
        return {"observation": observation}
    except Exception as e:
        logger.error(f"artwork-skill-observation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/artwork-skill-deepdive")
async def artwork_skill_deepdive(
    skill_name: str = Form(...),
    skill_desc: str = Form(...),
    photo_uri: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    model: Optional[AIProvider] = Form(None),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    artwork_id: Optional[str] = Form(None),
    background_tasks: BackgroundTasks = None,
):
    """Get a deep-dive reading and open question for a given skill (Interactive Explore mode)."""
    ai_provider = determine_ai_provider(model)
    image_bytes = await _resolve_image_bytes(image, photo_uri)
    try:
        ai_service = AIServiceFactory.get_fast_service(ai_provider)
        result = await ai_service.get_skill_deepdive(
            image_bytes, skill_name, skill_desc, language=language
        )
        if user_id:
            skill_cat = _SKILL_CAT.get(skill_name, "STRUCTURE")
            if background_tasks:
                background_tasks.add_task(_log_skill_event_sync, user_id, skill_name, skill_cat, "deepdive", artwork_id)
        return result
    except Exception as e:
        logger.error(f"artwork-skill-deepdive error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/run-migrations")
async def run_migrations(db: Session = Depends(get_db)):
    """One-shot idempotent migration endpoint. Safe to call multiple times."""
    from sqlalchemy import text as _text
    from app.database.connection import engine as _engine
    with _engine.connect() as _conn:
        _conn.execute(_text("ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_stats JSONB"))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS skill_events (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR NOT NULL,
                artwork_id VARCHAR,
                skill_name VARCHAR NOT NULL,
                event_type VARCHAR NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS artwork_entities (
                id VARCHAR PRIMARY KEY,
                canonical_artist VARCHAR NOT NULL,
                canonical_title VARCHAR NOT NULL,
                display_artist VARCHAR NOT NULL,
                display_title VARCHAR NOT NULL,
                instance_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE (canonical_artist, canonical_title)
            )
        """))
        _conn.execute(_text("""
            CREATE TABLE IF NOT EXISTS public_comments (
                id VARCHAR PRIMARY KEY,
                entity_id VARCHAR NOT NULL REFERENCES artwork_entities(id) ON DELETE CASCADE,
                user_id VARCHAR NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        _conn.execute(_text("""
            ALTER TABLE saved_artworks
            ADD COLUMN IF NOT EXISTS artwork_entity_id VARCHAR
            REFERENCES artwork_entities(id) ON DELETE SET NULL
        """))
        # Taste dimension columns on artwork_entities
        for col, typ in [
            ("dim_figurative_abstract",  "SMALLINT"),
            ("dim_emotive_conceptual",   "SMALLINT"),
            ("dim_serene_intense",       "SMALLINT"),
            ("dim_classical_avantgarde", "SMALLINT"),
            ("dim_playful_serious",      "SMALLINT"),
            ("dim_status",               "VARCHAR(20) DEFAULT 'pending'"),
            ("dim_analyzed_at",          "TIMESTAMP"),
            ("dim_error",                "TEXT"),
        ]:
            _conn.execute(_text(f"ALTER TABLE artwork_entities ADD COLUMN IF NOT EXISTS {col} {typ}"))
        _conn.commit()
    return {"status": "ok", "message": "Migrations applied"}


@router.post("/admin/backfill-entity-dimensions")
async def backfill_entity_dimensions(force: bool = False, db: Session = Depends(get_db)):
    """Analyze all ArtworkEntity rows that haven't been scored yet. Pass force=true to re-analyze all."""
    if force:
        pending = db.query(ArtworkEntity).all()
        # Reset so _do_dimension_analysis doesn't skip 'done' entries
        for e in pending:
            e.dim_status = "pending"
        db.commit()
    else:
        pending = (
            db.query(ArtworkEntity)
            .filter(ArtworkEntity.dim_status.in_(["pending", "failed", None]))
            .all()
        )
    total = len(pending)
    done = 0
    failed = 0
    for entity in pending:
        try:
            await _do_dimension_analysis(entity.id)
            db.expire(entity)
            db.refresh(entity)
            if entity.dim_status == "done":
                done += 1
            else:
                failed += 1
        except Exception as e:
            logger.warning("Backfill failed for entity %s: %s", entity.id, e)
            failed += 1
    return {"total": total, "done": done, "failed": failed}


# ---------------------------------------------------------------------------
# Taste dimension analysis
# ---------------------------------------------------------------------------

async def _do_dimension_analysis(entity_id: str) -> None:
    """Async core: score one entity on 5 taste dimensions and persist."""
    db = SessionLocal()
    try:
        entity = db.query(ArtworkEntity).filter(ArtworkEntity.id == entity_id).first()
        if not entity or entity.dim_status == "done":
            return
        prompt = _DIM_ANALYSIS_PROMPT.format(
            title=entity.display_title,
            artist=entity.display_artist,
            date_hint="unknown date",
            medium_hint="unknown medium",
            description_hint="No additional description available.",
        )
        entity.dim_status = "processing"
        db.commit()
        try:
            client = OpenAIAPIClient()
            raw = await client.client.chat.completions.create(
                model="gpt-5.4-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_completion_tokens=100,
            )
            text = raw.choices[0].message.content.strip()
            if text.startswith("```"):
                text = re.sub(r"^```[a-z]*\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
            scores = json.loads(text)
            def clamp(v):
                return v if v in (-1, 0, 1) else 0
            entity.dim_figurative_abstract  = clamp(scores.get("dim_figurative_abstract", 0))
            entity.dim_emotive_conceptual   = clamp(scores.get("dim_emotive_conceptual", 0))
            entity.dim_serene_intense       = clamp(scores.get("dim_serene_intense", 0))
            entity.dim_classical_avantgarde = clamp(scores.get("dim_classical_avantgarde", 0))
            entity.dim_playful_serious      = clamp(scores.get("dim_playful_serious", 0))
            entity.dim_status    = "done"
            entity.dim_analyzed_at = datetime.utcnow()
            entity.dim_error     = None
            db.commit()
            logger.info("Dimension analysis done for entity %s", entity_id)
        except Exception as e:
            entity.dim_status = "failed"
            entity.dim_error  = str(e)
            db.commit()
            logger.warning("Dimension analysis failed for entity %s: %s", entity_id, e)
    finally:
        db.close()


def _run_dimension_analysis_bg(entity_id: str) -> None:
    """Sync wrapper for use as a FastAPI background task (runs in threadpool)."""
    import asyncio as _asyncio
    _asyncio.run(_do_dimension_analysis(entity_id))


async def _do_insights(artwork_id: str, artist_name: str, artwork_name: str, language: Optional[str]) -> None:
    """Compute and persist Behind-the-Frame insights for one artwork."""
    if not artist_name or artist_name.lower() in ("unknown", "unknown artist", ""):
        return
    try:
        ai_service = AIServiceFactory.get_service(determine_ai_provider(None))
        points = await ai_service.get_insights(
            artist_name=artist_name,
            artwork_name=artwork_name or "Untitled",
            language=language,
        )
        with SessionLocal() as db:
            art = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
            if art:
                art.insights = points
                db.commit()
    except Exception as _e:
        logger.warning("Insights bg task failed for %s: %s", artwork_id, _e)



async def _do_artist_bio(artist_entity_id: str) -> None:
    """Fetch and persist bio for one ArtistEntity from Wikidata/Wikipedia."""
    from app.services.wikidata_service import get_artist_info_from_wiki

    with SessionLocal() as db:
        entity = db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
        if not entity or entity.bio_status == "done":
            return
        artist_name = entity.display_name
        entity.bio_status = "processing"
        entity.bio = None
        db.commit()
    try:
        bio_data = await get_artist_info_from_wiki(artist_name)
        # If Wikidata has no record, store nulls — still mark done so we don't retry indefinitely
        if bio_data is None:
            bio_data = {"bio": None, "nationality": None, "birth_year": None, "death_year": None, "movements": []}
        with SessionLocal() as db:
            entity = db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
            if entity:
                entity.bio = bio_data.get("bio")
                entity.nationality = bio_data.get("nationality")
                entity.birth_year = bio_data.get("birth_year")
                entity.death_year = bio_data.get("death_year")
                entity.movements = bio_data.get("movements") or []
                entity.profile_image_url = bio_data.get("profile_image_url")
                entity.bio_status = "done"
                db.commit()
        logger.info("Artist bio done for %s (%s)", artist_entity_id, artist_name)
    except Exception as _e:
        logger.warning("Artist bio failed for %s: %s", artist_entity_id, _e, exc_info=True)
        with SessionLocal() as db:
            entity = db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
            if entity:
                entity.bio_status = "failed"
                db.commit()


def _run_artist_bio_bg(artist_entity_id: str) -> None:
    """Sync wrapper for use as a FastAPI background task (runs in threadpool)."""
    import asyncio as _asyncio
    _asyncio.run(_do_artist_bio(artist_entity_id))


_DIM_ANALYSIS_PROMPT = """\
You are an art analysis assistant. Given an artwork's metadata, score it on five taste dimensions.

Artwork: "{title}" by {artist} ({date_hint})
Medium: {medium_hint}
Description: {description_hint}

For each dimension output exactly -1, 0, or 1:
  -1 = clearly left pole
   0 = neutral / both sides / cannot determine
   1 = clearly right pole

Dimensions:
- dim_figurative_abstract: Is the image recognisably depicting real things? (-1=figurative, 1=abstract)
- dim_emotive_conceptual: Is the primary appeal emotion or intellect/idea? (-1=emotive, 1=conceptual)
- dim_serene_intense: Is the visual mood calm or tense/dramatic? (-1=serene, 1=intense)
- dim_classical_avantgarde: Does it follow tradition or break from it? (-1=classical, 1=avant-garde)
- dim_playful_serious: Is the tone light/playful or heavy/serious? (-1=playful, 1=serious)

Respond with ONLY valid JSON, no explanation:
{{"dim_figurative_abstract": <int>, "dim_emotive_conceptual": <int>, "dim_serene_intense": <int>, "dim_classical_avantgarde": <int>, "dim_playful_serious": <int>}}
"""

_ARCHETYPES: list[dict] = []

def _load_archetypes() -> list[dict]:
    global _ARCHETYPES
    if not _ARCHETYPES:
        import os, json as _json
        path = os.path.join(os.path.dirname(__file__), "..", "data", "taste_archetypes.json")
        with open(os.path.normpath(path), encoding="utf-8") as f:
            _ARCHETYPES = _json.load(f)
    return _ARCHETYPES


def _match_archetype(scores: dict) -> dict | None:
    """Map a dict of {dim: float} AVG scores to the best-matching archetype."""
    THRESHOLD = 0.3

    def pole(v):
        if v is None:
            return 0
        if v > THRESHOLD:
            return 1
        if v < -THRESHOLD:
            return -1
        return 0

    user_poles = {
        "figurative_abstract":  pole(scores.get("figurative_abstract")),
        "emotive_conceptual":   pole(scores.get("emotive_conceptual")),
        "serene_intense":       pole(scores.get("serene_intense")),
        "classical_avantgarde": pole(scores.get("classical_avantgarde")),
        "playful_serious":      pole(scores.get("playful_serious")),
    }

    archetypes = _load_archetypes()
    best, best_score = None, -1
    for arch in archetypes:
        d = arch["dims"]
        match = sum(
            1 for k in user_poles
            if user_poles[k] != 0 and d.get(k) == user_poles[k]
        )
        # penalise mismatches on decisive dimensions
        mismatch = sum(
            1 for k in user_poles
            if user_poles[k] != 0 and d.get(k) != user_poles[k]
        )
        score = match - 0.5 * mismatch
        if score > best_score:
            best_score = score
            best = arch
    return best


class GenerateTasteProfileRequest(BaseModel):
    user_id: str


@router.post("/entities/{entity_id}/analyze-dimensions")
async def analyze_entity_dimensions(entity_id: str, db: Session = Depends(get_db)):
    """Score an ArtworkEntity on 5 taste dimensions via LLM. Idempotent."""
    entity = db.query(ArtworkEntity).filter(ArtworkEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    if entity.dim_status == "done":
        entity_db = db.query(ArtworkEntity).filter(ArtworkEntity.id == entity_id).first()
        return {"status": "already_done", "entity_id": entity_id, "scores": {
            "dim_figurative_abstract":  entity_db.dim_figurative_abstract,
            "dim_emotive_conceptual":   entity_db.dim_emotive_conceptual,
            "dim_serene_intense":       entity_db.dim_serene_intense,
            "dim_classical_avantgarde": entity_db.dim_classical_avantgarde,
            "dim_playful_serious":      entity_db.dim_playful_serious,
        }}
    await _do_dimension_analysis(entity_id)
    db.expire_all()
    entity = db.query(ArtworkEntity).filter(ArtworkEntity.id == entity_id).first()
    if entity and entity.dim_status == "done":
        return {"status": "done", "entity_id": entity_id, "scores": {
            "dim_figurative_abstract":  entity.dim_figurative_abstract,
            "dim_emotive_conceptual":   entity.dim_emotive_conceptual,
            "dim_serene_intense":       entity.dim_serene_intense,
            "dim_classical_avantgarde": entity.dim_classical_avantgarde,
            "dim_playful_serious":      entity.dim_playful_serious,
        }}
    raise HTTPException(status_code=500, detail="Dimension analysis failed")


@router.get("/taste-profile")
async def get_taste_profile(user_id: str, db: Session = Depends(get_db)):
    """Return the persisted taste profile snapshot and current eligibility state."""
    response = _build_taste_profile_response(user_id, db)
    response["total_artworks"] = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).count()

    if response.get("is_generated"):
        classified_rows = (
            db.query(SavedArtwork)
            .filter(
                SavedArtwork.user_id == user_id,
                SavedArtwork.classification.in_(["love", "not_for_me", "respect"]),
            )
            .all()
        )
        response["dimension_examples"] = _build_taste_examples(
            classified_rows,
            response.get("taste_vector") or {},
        )

    return response


@router.post("/taste-profile/generate")
async def generate_taste_profile(
    request: GenerateTasteProfileRequest = Body(...),
    db: Session = Depends(get_db),
):
    """Generate or regenerate a persisted taste profile snapshot for a user."""
    user_id = request.user_id
    rows = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No artworks found for this user")

    loved_artworks = [art for art in rows if (art.classification or "unsorted") == "love"]
    rejected_artworks = [art for art in rows if (art.classification or "unsorted") == "not_for_me"]
    respected_artworks = [art for art in rows if (art.classification or "unsorted") == "respect"]

    eligible_count = len(loved_artworks) + len(rejected_artworks)
    if eligible_count < PROFILE_MIN_SAMPLE:
        raise HTTPException(
            status_code=400,
            detail=f"At least {PROFILE_MIN_SAMPLE} love or not-for-me classifications are required",
        )

    love_vector = _vector_from_rows(loved_artworks)
    reject_vector = _vector_from_rows(rejected_artworks)
    taste_vector = _derive_taste_vector(love_vector, reject_vector)
    narrative_summary = await _generate_taste_narrative(
        taste_vector,
        loved_artworks,
        rejected_artworks,
        respected_artworks,
    )

    profile = _get_or_create_taste_profile(user_id, db)
    profile.status = "generated"
    profile.eligible_count = eligible_count
    profile.required_count = PROFILE_MIN_SAMPLE
    profile.love_count = len(loved_artworks)
    profile.reject_count = len(rejected_artworks)
    profile.respect_count = len(respected_artworks)
    profile.is_outdated = 0
    profile.generated_at = datetime.utcnow()
    profile.outdated_at = None
    profile.love_vector = love_vector
    profile.reject_vector = reject_vector
    profile.taste_vector = taste_vector
    profile.source_artwork_ids = [art.id for art in (loved_artworks + rejected_artworks + respected_artworks)]
    profile.narrative_summary = narrative_summary
    db.commit()

    response = _build_taste_profile_response(user_id, db)
    response["dimension_examples"] = _build_taste_examples(
        loved_artworks + rejected_artworks + respected_artworks,
        taste_vector,
    )
    response["total_artworks"] = len(rows)
    return response


@router.post("/visit/chat")
async def visit_chat(
    request: VisitChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    """Chat with the curator about the current exhibition (collection of works). Supports OpenAI, Claude, Gemini."""
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = []
    if not request.conversation_history and request.items:
        for item in request.items[:10]:
            b = await _image_url_to_bytes(item.url)
            if b:
                image_bytes_list.append(b)
    try:
        response_text = await ai_service.visit_chat(
            items=[{"keywords": i.keywords} for i in request.items],
            history=request.conversation_history,
            new_message=request.new_message,
            image_bytes_list=image_bytes_list,
        )
        return {"response": response_text}
    except Exception as e:
        logger.exception("Exhibition chat failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/visit/chat-stream")
async def visit_chat_stream(
    request: VisitChatRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    """Stream exhibition curator response as SSE (event: chunk, then event: complete). Supports OpenAI, Claude, Gemini."""
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    image_bytes_list = []
    if not request.conversation_history and request.items:
        for item in request.items[:10]:
            b = await _image_url_to_bytes(item.url)
            if b:
                image_bytes_list.append(b)

    async def event_generator():
        full_text = ""
        try:
            async for chunk in ai_service.visit_chat_stream(
                items=[{"keywords": i.keywords} for i in request.items],
                history=request.conversation_history,
                new_message=request.new_message,
                image_bytes_list=image_bytes_list,
            ):
                full_text += chunk
                yield f"event: chunk\ndata: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
            yield f"event: complete\ndata: {json.dumps({'type': 'result', 'response': full_text})}\n\n"
        except Exception as e:
            logger.exception("Exhibition chat stream failed")
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class DefineTermRequest(BaseModel):
    tag: str

@router.post("/define-aesthetic-term")
async def define_aesthetic_term(
    request: DefineTermRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    """Get a concise definition and external resonances for an aesthetic term."""
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    try:
        result = await ai_service.define_aesthetic_term(request.tag)
        return {
            "definition": result["definition"],
            "externalResonances": result["external_resonances"],
        }
    except Exception as e:
        logger.exception("Define aesthetic term failed")
        raise HTTPException(status_code=500, detail=str(e))

class InsightsRequest(BaseModel):
    artist_name: str
    artwork_name: str
    language: Optional[str] = None


@router.post("/artwork-insights")
async def artwork_insights(
    request: InsightsRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    """Return 0–3 unlock points anchored on the artist's known biography/intent."""
    if not request.artist_name or request.artist_name.lower() in ("unknown", "unknown artist", ""):
        return {"points": []}
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    try:
        points = await ai_service.get_insights(
            artist_name=request.artist_name,
            artwork_name=request.artwork_name or "Untitled",
            language=request.language,
        )
        return {"points": points}
    except Exception as e:
        logger.exception("Unlock points failed")
        raise HTTPException(status_code=500, detail=str(e))


class GenerateSpeechRequest(BaseModel):
    text: str


@router.post("/generate-speech")
async def generate_speech(
    request: GenerateSpeechRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    """Generate TTS audio for the given text (Gemini TTS). Returns raw PCM bytes (24kHz mono)."""
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    if not isinstance(ai_service.ai_client, GeminiAPIClient):
        raise HTTPException(status_code=503, detail="Speech generation requires Gemini")
    client = ai_service.ai_client
    try:
        audio_bytes = await client.generate_speech(request.text)
        if not audio_bytes:
            raise HTTPException(status_code=502, detail="No audio generated")
        return Response(
            content=audio_bytes,
            media_type="application/octet-stream",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Generate speech failed")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Artwork CRUD Endpoints
# =============================================================================

@router.get("/artworks")
async def get_artworks(
    user_id: str = Query(...),
    recognized_only: Optional[bool] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Get saved artworks for a user

    - **user_id**: User ID (required)
    - **recognized_only**: Filter by recognition status
    - **limit**: Max items (default 50, max 100)
    - **offset**: Skip items (default 0)
    """
    try:
        query = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id)

        if recognized_only is not None:
            query = query.filter(SavedArtwork.is_recognized == (1 if recognized_only else 0))

        artworks = query.order_by(SavedArtwork.created_at.desc()).offset(offset).limit(limit).all()

        return {
            "items": [a.to_dict(include_conversations=True) for a in artworks],
            "count": len(artworks),
            "offset": offset,
            "limit": limit
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve artworks: {str(e)}")


@router.get("/smart-collections")
async def get_smart_collections(
    user_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Return auto-generated collection cards for a user, grouped by art movement.
    Each card has name, rarity, hook text, artwork count, and cover photo URIs.
    """
    from app.utils.prompt_loader import get_movement_by_name

    PERIOD_LABELS = {"Unknown", "Historical", "Modern", "Contemporary", "Now"}

    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.user_id == user_id,
        SavedArtwork.is_recognized == 1,
    ).all()

    # For each artist, resolve their dominant movement (plurality) so all their
    # works land in the same collection even if the AI labeled them inconsistently.
    artist_movement_counts: dict = {}
    for aw in artworks:
        mv = aw.movement
        if not mv or mv in PERIOD_LABELS or not aw.artist_name:
            continue
        artist_movement_counts.setdefault(aw.artist_name, {})
        artist_movement_counts[aw.artist_name][mv] = artist_movement_counts[aw.artist_name].get(mv, 0) + 1

    dominant_movement: dict = {
        artist: max(counts, key=counts.get)
        for artist, counts in artist_movement_counts.items()
    }

    movement_groups: dict = {}
    for aw in artworks:
        mv = aw.movement
        if not mv or mv in PERIOD_LABELS:
            continue
        # Override with artist's dominant movement if available
        if aw.artist_name and aw.artist_name in dominant_movement:
            mv = dominant_movement[aw.artist_name]
        movement_groups.setdefault(mv, []).append(aw)

    collections = []
    for movement_name, group in sorted(movement_groups.items(), key=lambda x: -len(x[1])):
        meta = get_movement_by_name(movement_name)
        rarity = meta.get("rarity", "common") if meta else "common"
        description = meta.get("description", "") if meta else ""
        count = len(group)
        hook = _movement_hook(movement_name, count)
        covers = [aw.photo_uri for aw in group[:4]]
        collections.append({
            "id": f"movement_{movement_name.lower().replace(' ', '_').replace('/', '_')}",
            "type": "movement",
            "name": movement_name,
            "rarity": rarity,
            "description": description,
            "artwork_count": count,
            "artwork_ids": [aw.id for aw in group],
            "cover_uris": covers,
            "hook": hook,
        })

    return {"collections": collections}


def _movement_hook(name: str, count: int) -> str:
    if count == 1:
        return f"Your first encounter with {name}."
    elif count <= 3:
        return f"A small but sharp {name} thread."
    elif count <= 6:
        return f"{count} {name} works — a pattern is forming."
    else:
        return f"You keep returning to {name}. {count} works deep."


@router.get("/artists")
async def list_user_artists(user_id: str = Query(...), db: Session = Depends(get_db)):
    """List all ArtistEntity records that have at least one artwork from *user_id*."""
    rows = (
        db.query(ArtistEntity, func.count(SavedArtwork.id).label("artwork_count"))
        .join(SavedArtwork, SavedArtwork.artist_entity_id == ArtistEntity.id)
        .filter(SavedArtwork.user_id == user_id)
        .group_by(ArtistEntity.id)
        .order_by(ArtistEntity.display_name)
        .all()
    )
    return [{**entity.to_dict(), "artwork_count": count} for entity, count in rows]


@router.get("/artists/{identifier}")
async def get_artist(identifier: str, db: Session = Depends(get_db)):
    """Return an ArtistEntity by UUID or by URL slug (e.g. 'ian_cheng' → canonical 'ian cheng')."""
    entity = db.query(ArtistEntity).filter(ArtistEntity.id == identifier).first()
    if not entity:
        canonical = identifier.replace("_", " ").lower()
        entity = db.query(ArtistEntity).filter(ArtistEntity.canonical_name == canonical).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Artist not found")
    return entity.to_dict()


@router.get("/artists/{artist_id}/artworks")
async def get_artist_artworks(
    artist_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Return all artworks belonging to *user_id* that are linked to this artist entity."""
    artworks = (
        db.query(SavedArtwork)
        .filter(SavedArtwork.artist_entity_id == artist_id, SavedArtwork.user_id == user_id)
        .order_by(SavedArtwork.created_at.desc())
        .all()
    )
    return [a.to_dict(include_conversations=False) for a in artworks]


@router.post("/artworks/{artwork_id}/artist")
async def backfill_artwork_artist(
    artwork_id: str,
    db: Session = Depends(get_db),
):
    """Lazily link and compute the ArtistEntity for an existing artwork. Awaits bio so the response is complete."""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    artist_name = artwork.artist_name or ""
    if not artist_name or artist_name.lower() in ("unknown", "unknown artist", ""):
        return {"artist_entity_id": None}

    # If already linked and bio is done, return immediately
    if artwork.artist_entity_id:
        entity = db.query(ArtistEntity).filter(ArtistEntity.id == artwork.artist_entity_id).first()
        if entity and entity.bio_status == "done":
            return entity.to_dict()
        if entity:
            # Retry bio computation (handles pending, processing, or failed states)
            artist_entity_id = entity.id
            db.close()
            await _do_artist_bio(artist_entity_id)
            with SessionLocal() as fresh_db:
                entity = fresh_db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
                return entity.to_dict() if entity else {"artist_entity_id": artist_entity_id}

    # Create/link entity then compute bio inline
    artist_ent = upsert_artist_entity(db, artist_name)
    db.flush()
    artwork.artist_entity_id = artist_ent.id
    db.commit()
    artist_entity_id = artist_ent.id
    db.close()

    await _do_artist_bio(artist_entity_id)
    with SessionLocal() as fresh_db:
        entity = fresh_db.query(ArtistEntity).filter(ArtistEntity.id == artist_entity_id).first()
        return entity.to_dict() if entity else {"artist_entity_id": artist_entity_id}


@router.get("/artworks/{artwork_id}")
async def get_artwork(artwork_id: str, db: Session = Depends(get_db)):
    """Get a specific artwork with full conversation history"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    return artwork.to_dict()


@router.get("/artworks/{artwork_id}/community")
async def get_community(artwork_id: str, db: Session = Depends(get_db)):
    """Return public comments for the artwork entity linked to this instance."""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork or not artwork.artwork_entity_id:
        return {"entity": None, "comments": []}

    entity = db.query(ArtworkEntity).filter(ArtworkEntity.id == artwork.artwork_entity_id).first()
    if not entity:
        return {"entity": None, "comments": []}

    comments = (
        db.query(PublicComment)
        .filter(PublicComment.entity_id == entity.id)
        .order_by(PublicComment.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "entity": entity.to_dict(),
        "comments": [c.to_dict() for c in comments],
    }


class PublishCommentRequest(BaseModel):
    user_id: str
    text: str


@router.post("/artworks/{artwork_id}/community/comments")
async def publish_comment(
    artwork_id: str,
    body: PublishCommentRequest,
    db: Session = Depends(get_db),
):
    """Publish a public comment to the shared artwork entity."""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    # Lazily link entity if missing (e.g. artwork saved before this feature)
    if not artwork.artwork_entity_id and artwork.is_recognized and artwork.artist_name and artwork.artwork_name:
        entity = upsert_artwork_entity(db, artwork.artist_name, artwork.artwork_name)
        db.flush()
        artwork.artwork_entity_id = entity.id

    if not artwork.artwork_entity_id:
        raise HTTPException(status_code=400, detail="Artwork has no linked entity (unrecognized)")

    comment = PublicComment(
        entity_id=artwork.artwork_entity_id,
        user_id=body.user_id,
        text=body.text.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment.to_dict()


@router.delete("/artworks/{artwork_id}/community/comments/{comment_id}")
async def delete_comment(
    artwork_id: str,
    comment_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Delete own public comment."""
    comment = db.query(PublicComment).filter(
        PublicComment.id == comment_id,
        PublicComment.user_id == user_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found or not yours")
    db.delete(comment)
    db.commit()
    return {"ok": True}


@router.put("/artworks/{artwork_id}")
async def update_artwork(
    artwork_id: str,
    request: UpdateArtworkRequest,
    db: Session = Depends(get_db)
):
    """
    Update artwork details

    - **artwork_id**: Artwork ID
    - **request**: JSON body with optional fields to update
    """
    try:
        artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

        if not artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")

        if request.artist_name is not None:
            artwork.artist_name = request.artist_name.strip()
        if request.artwork_name is not None:
            artwork.artwork_name = request.artwork_name.strip()
        if request.summary is not None:
            artwork.summary = request.summary
        if request.analysis is not None:
            artwork.analysis = request.analysis
        if request.params is not None:
            artwork.params = request.params
        # Merge convenience date/medium fields into params
        if request.date is not None or request.medium is not None:
            current_params = dict(artwork.params) if isinstance(artwork.params, dict) else {}
            if request.date is not None:
                current_params['date'] = request.date
            if request.medium is not None:
                current_params['medium'] = request.medium
            artwork.params = current_params
        if request.tags is not None:
            batch_link_tags(db, artwork, request.tags)

        # Recalculate is_recognized
        artwork.is_recognized = 1 if (
            artwork.artist_name.lower() != "unknown artist" and
            artwork.artwork_name.lower() != "unknown"
        ) else 0

        db.commit()
        db.refresh(artwork)

        return artwork.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update artwork: {str(e)}")


@router.patch("/artworks/{artwork_id}/classification")
async def update_artwork_classification(
    artwork_id: str,
    request: UpdateArtworkClassificationRequest,
    db: Session = Depends(get_db)
):
    """Update the user's classification for a saved artwork."""
    classification = (request.classification or "").strip().lower()
    if classification not in CLASSIFICATION_VALUES:
        raise HTTPException(status_code=400, detail="Invalid classification")

    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    previous = artwork.classification or "unsorted"
    artwork.classification = classification
    artwork.classification_updated_at = datetime.utcnow()
    invalidated = previous != classification and _mark_taste_profile_outdated(artwork.user_id, db)
    db.commit()

    return {
        "artwork_id": artwork.id,
        "classification": artwork.classification,
        "profile_invalidated": invalidated,
    }


@router.post("/artworks/analyze")
async def analyze_artwork_unified(
    image: Optional[UploadFile] = File(None),
    artwork_id: Optional[str] = Form(None),
    artist_name: Optional[str] = Form(None),
    artwork_name: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    current_user: Optional[User] = Depends(get_current_user),
):
    """Analyze a new upload or refresh an existing artwork using either image or artwork_id."""
    if not image and not artwork_id:
        raise HTTPException(status_code=400, detail="Must provide either image or artwork_id")

    require_same_user(current_user, user_id)
    existing_artwork: Optional[SavedArtwork] = None
    parsed_location = None
    image_bytes: Optional[bytes] = None

    if artwork_id:
        existing_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
        if not existing_artwork:
            raise HTTPException(status_code=404, detail="Artwork not found")
        if not user_id:
            user_id = existing_artwork.user_id or existing_artwork.device_id
        if not session_id:
            session_id = existing_artwork.session_id
        if location is None:
            location = existing_artwork.location
        if photo_time is None:
            photo_time = existing_artwork.photo_time
        if photo_uri is None:
            photo_uri = existing_artwork.photo_uri

    if user_id and settings.use_database and not existing_artwork:
        check_artwork_quota(user_id, db)

    if image:
        image_bytes, image_metadata = await process_image(image)
        if location:
            logger.info(f"Metadata Source [Location]: FRONTEND (Value: {location})")
        elif image_metadata.get("location_data"):
            location = json.dumps(image_metadata["location_data"])
            logger.info(f"Metadata Source [Location]: PHOTO EXIF (Resolved: {location})")
        elif latitude is not None and longitude is not None:
            location_data = await reverse_geocode(latitude, longitude)
            location = json.dumps(location_data)
            logger.info(f"Metadata Source [Location]: FRONTEND COORDS (Resolved: {location})")
        if image_metadata.get("exif_timestamp"):
            photo_time = image_metadata["exif_timestamp"]
    else:
        assert existing_artwork is not None
        image_bytes = await _image_url_to_bytes(existing_artwork.photo_uri)
        if not image_bytes:
            try:
                storage = StorageFactory.get_service_for_uri(existing_artwork.photo_uri)
                if storage:
                    image_bytes = await storage.load(existing_artwork.photo_uri)
            except Exception as e:
                logger.warning(f"Could not load image for analysis refresh: {e}")
        if not image_bytes:
            raise HTTPException(status_code=422, detail="Could not load stored image for analysis")
        image_bytes = compress_for_ai(image_bytes)

    if location and isinstance(location, str):
        try:
            parsed_location = json.loads(location) if location.strip().startswith('{') else {"raw": location}
        except Exception:
            parsed_location = {"raw": location}
    elif location:
        parsed_location = location

    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    vision_hint, vision_ref_urls = await get_vision_hint(image_bytes)
    session_context = await get_session_context(session_id) if session_id else None

    analysis_text = await ai_service.identify_artist(
        image_bytes,
        identity=identity,
        language=language,
        session_context=session_context,
        vision_hint=vision_hint,
        artist_name=artist_name,
        artwork_name=artwork_name,
    )

    fallback_artist = existing_artwork.artist_name if existing_artwork and existing_artwork.artist_name else "Unknown Artist"
    fallback_title = existing_artwork.artwork_name if existing_artwork and existing_artwork.artwork_name else "Untitled"
    parsed_result = _parse_identify_result(analysis_text, fallback_artist=fallback_artist, fallback_title=fallback_title)
    parsed_result = _apply_authoritative_identity(parsed_result, artist_name, artwork_name)

    linked_artist_entity_id = existing_artwork.artist_entity_id if existing_artwork else None

    if existing_artwork:
        existing_artwork.artist_name = parsed_result["artist_name"]
        existing_artwork.artwork_name = parsed_result["artwork_name"]
        existing_artwork.analysis = parsed_result["analysis"]
        existing_artwork.movement = parsed_result["movement"]
        existing_artwork.period_bucket = parsed_result["period_bucket"]
        existing_artwork.is_recognized = 1 if (
            parsed_result["artist_name"].lower() != "unknown artist" and
            parsed_result["artwork_name"].lower() != "unknown"
        ) else 0
        if vision_ref_urls:
            existing_artwork.reference_urls = vision_ref_urls
        current_params = dict(existing_artwork.params) if isinstance(existing_artwork.params, dict) else {}
        if parsed_result["date"] is not None:
            current_params["date"] = parsed_result["date"]
        if parsed_result["medium"] is not None:
            current_params["medium"] = parsed_result["medium"]
        existing_artwork.params = current_params
        if parsed_result["tags"]:
            batch_link_tags(db, existing_artwork, parsed_result["tags"])
        entity_id_fast = None
        artist_entity_id_fast = None
        if existing_artwork.artist_name and existing_artwork.artist_name != "Unknown Artist" and existing_artwork.artwork_name:
            try:
                entity = upsert_artwork_entity(db, existing_artwork.artist_name, existing_artwork.artwork_name)
                artist_ent = upsert_artist_entity(db, existing_artwork.artist_name)
                db.flush()
                existing_artwork.artwork_entity_id = entity.id
                existing_artwork.artist_entity_id = artist_ent.id
                linked_artist_entity_id = artist_ent.id
                if entity.dim_status in (None, "pending"):
                    entity_id_fast = entity.id
                if artist_ent.bio_status in (None, "pending"):
                    artist_entity_id_fast = artist_ent.id
            except Exception as e:
                logger.warning("Entity upsert failed in unified refresh: %s", e)
        db.commit()
        db.refresh(existing_artwork)

        if entity_id_fast and background_tasks:
            background_tasks.add_task(_run_dimension_analysis_bg, entity_id_fast)
        if artist_entity_id_fast and background_tasks:
            background_tasks.add_task(_run_artist_bio_bg, artist_entity_id_fast)
        if existing_artwork.artist_name and existing_artwork.artist_name != "Unknown Artist":
            if background_tasks:
                background_tasks.add_task(_do_insights, str(existing_artwork.id), existing_artwork.artist_name, existing_artwork.artwork_name or "Untitled", language)
            else:
                _task = asyncio.create_task(_do_insights(str(existing_artwork.id), existing_artwork.artist_name, existing_artwork.artwork_name or "Untitled", language))
                _active_tasks.add(_task)
                _task.add_done_callback(_active_tasks.discard)

        return {
            "artist_name": parsed_result["artist_name"],
            "artwork_name": parsed_result["artwork_name"],
            "analysis": parsed_result["analysis"],
            "date": parsed_result["date"],
            "medium": parsed_result["medium"],
            "movement": parsed_result["movement"],
            "period_bucket": parsed_result["period_bucket"],
            "tags": parsed_result["tags"],
            "artwork_id": str(existing_artwork.id),
            "reference_urls": vision_ref_urls,
            "artist_entity_id": linked_artist_entity_id,
            "model_used": ai_provider.value,
        }

    response = {"analysis": parsed_result["analysis"], "model_used": ai_provider.value}
    if user_id:
        generated_photo_uri = photo_uri
        if not generated_photo_uri:
            if client_type == "web" or image is not None:
                storage = get_storage_service()
                generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
            else:
                import uuid as uuid_mod
                generated_photo_uri = f"artwork_{uuid_mod.uuid4().hex[:12]}"

        def _save_artwork_sync(
            u_id, s_id, p_uri, a_name, w_name, e_analysis, d_val, m_val, loc, p_time, mv_val, pb_val, ref_urls
        ):
            with SessionLocal() as local_db:
                usr = local_db.query(User).filter(User.user_id == u_id).first()
                if not usr:
                    usr = User(user_id=u_id, device_id=u_id)
                    local_db.add(usr)
                    local_db.flush()

                if s_id:
                    sess_record = local_db.query(SessionModel).filter(SessionModel.id == s_id).first()
                    if not sess_record:
                        initial_title = "Personal Visit"
                        if loc:
                            try:
                                loc_data = json.loads(loc) if isinstance(loc, str) else loc
                                initial_title = loc_data.get("museum") or loc_data.get("city") or initial_title
                            except Exception:
                                pass
                        sess_record = SessionModel(id=s_id, user_id=u_id or "anonymous", title=initial_title)
                        local_db.add(sess_record)
                        local_db.flush()

                art = SavedArtwork(
                    photo_uri=p_uri,
                    artist_name=a_name,
                    artwork_name=w_name,
                    user_id=u_id,
                    is_recognized=1 if a_name != "Unknown Artist" else 0,
                    analysis=e_analysis,
                    params={"date": d_val, "medium": m_val},
                    session_id=s_id,
                    location=loc,
                    photo_time=p_time,
                    movement=mv_val,
                    period_bucket=pb_val,
                    reference_urls=ref_urls or [],
                )
                local_db.add(art)
                local_db.commit()
                local_db.refresh(art)
                _ensure_session_artwork_link(
                    local_db,
                    session_id=s_id,
                    artwork_id=str(art.id),
                    source="upload",
                )
                local_db.commit()

                entity_id_for_analysis = None
                artist_entity_id_for_bio = None
                linked_artist_entity_id_local = None
                if a_name and a_name != "Unknown Artist" and w_name:
                    try:
                        with local_db.begin_nested():
                            entity = upsert_artwork_entity(local_db, a_name, w_name)
                            artist_ent = upsert_artist_entity(local_db, a_name)
                            local_db.flush()
                            art.artwork_entity_id = entity.id
                            art.artist_entity_id = artist_ent.id
                        local_db.commit()
                        linked_artist_entity_id_local = artist_ent.id
                        if entity.dim_status in (None, "pending"):
                            entity_id_for_analysis = entity.id
                        if artist_ent.bio_status in (None, "pending"):
                            artist_entity_id_for_bio = artist_ent.id
                    except Exception as _e:
                        logger.warning("Entity upsert failed in unified save: %s", _e)

                return str(art.id), entity_id_for_analysis, artist_entity_id_for_bio, linked_artist_entity_id_local

        artwork_id_result, entity_id_fast, artist_entity_id_fast, linked_artist_entity_id = await anyio.to_thread.run_sync(
            _save_artwork_sync,
            user_id,
            session_id,
            generated_photo_uri,
            parsed_result["artist_name"],
            parsed_result["artwork_name"],
            parsed_result["analysis"],
            parsed_result["date"],
            parsed_result["medium"],
            parsed_location,
            photo_time,
            parsed_result["movement"],
            parsed_result["period_bucket"],
            vision_ref_urls,
        )

        if entity_id_fast and background_tasks:
            background_tasks.add_task(_run_dimension_analysis_bg, entity_id_fast)
        if artist_entity_id_fast and background_tasks:
            background_tasks.add_task(_run_artist_bio_bg, artist_entity_id_fast)
        if artwork_id_result and parsed_result["artist_name"] and parsed_result["artist_name"] != "Unknown Artist":
            _ui = asyncio.create_task(_do_insights(artwork_id_result, parsed_result["artist_name"], parsed_result["artwork_name"], language))
            _active_tasks.add(_ui)
            _ui.add_done_callback(_active_tasks.discard)
        if session_id and background_tasks:
            background_tasks.add_task(
                update_session_narrative_task,
                session_id=session_id,
                new_artwork_data={
                    "artist": parsed_result["artist_name"],
                    "title": parsed_result["artwork_name"],
                    "description": parsed_result["analysis"],
                },
                identity=identity,
                language=language,
            )

        response.update({
            "artwork_id": artwork_id_result,
            "artist_name": parsed_result["artist_name"],
            "artwork_name": parsed_result["artwork_name"],
            "photo_uri": generated_photo_uri,
            "date": parsed_result["date"],
            "medium": parsed_result["medium"],
            "location": location,
            "photo_time": photo_time,
            "tags": parsed_result["tags"],
            "artist_entity_id": linked_artist_entity_id,
            "reference_urls": vision_ref_urls,
        })
        return response

    response.update({
        "artist_name": parsed_result["artist_name"],
        "artwork_name": parsed_result["artwork_name"],
        "date": parsed_result["date"],
        "medium": parsed_result["medium"],
        "tags": parsed_result["tags"],
        "reference_urls": vision_ref_urls,
    })
    return response


@router.post("/artworks/{artwork_id}/reanalyze")
async def reanalyze_artwork(artwork_id: str, db: Session = Depends(get_db)):
    """
    Re-run AI identification on a saved artwork using its stored photo_uri.
    Updates artist_name, artwork_name, analysis, movement, period_bucket in DB.
    Does NOT re-upload the image to storage.
    """
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    # Load image bytes from stored URI (no storage write)
    image_bytes = await _image_url_to_bytes(artwork.photo_uri)
    if not image_bytes:
        try:
            storage = StorageFactory.get_service_for_uri(artwork.photo_uri)
            if storage:
                image_bytes = await storage.load(artwork.photo_uri)
        except Exception as e:
            logger.warning(f"Could not load image for reanalysis: {e}")
    if not image_bytes:
        raise HTTPException(status_code=422, detail="Could not load stored image for reanalysis")

    image_bytes = compress_for_ai(image_bytes)

    ai_provider = determine_ai_provider()
    ai_service = AIServiceFactory.get_service(ai_provider)

    vision_hint, vision_ref_urls = await get_vision_hint(image_bytes)

    analysis_text = await ai_service.identify_artist(
        image_bytes, identity="default", vision_hint=vision_hint,
    )

    # Parse structured response
    artist_name = artwork.artist_name
    artwork_name = artwork.artwork_name
    extracted_analysis = None
    date_val = None
    medium_val = None
    movement_val = None
    period_bucket_val = None
    extracted_tags: list = []

    try:
        json_str = analysis_text
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', analysis_text)
        if json_match:
            json_str = json_match.group(1).strip()
        parsed = json.loads(json_str)
        if isinstance(parsed, dict):
            artist_name    = parsed.get('artist', artist_name)
            artwork_name   = parsed.get('title', artwork_name)
            extracted_tags = parsed.get('tags', [])
            extracted_analysis = parsed.get('description', '')
            date_val       = parsed.get('date')
            medium_val     = parsed.get('medium')
            movement_val   = parsed.get('movement')
            period_bucket_val = parsed.get('period_bucket')
    except Exception as e:
        logger.warning(f"Failed to parse reanalysis response: {e}")

    if not extracted_analysis:
        extracted_analysis = analysis_text

    # Update DB record (no storage touch)
    artwork.artist_name   = artist_name
    artwork.artwork_name  = artwork_name
    artwork.analysis      = extracted_analysis
    artwork.movement      = movement_val
    artwork.period_bucket = period_bucket_val
    artwork.is_recognized = 1 if (
        artist_name.lower() != "unknown artist" and artwork_name.lower() != "unknown"
    ) else 0
    if vision_ref_urls:
        artwork.reference_urls = vision_ref_urls
    current_params = dict(artwork.params) if isinstance(artwork.params, dict) else {}
    if date_val is not None:
        current_params['date'] = date_val
    if medium_val is not None:
        current_params['medium'] = medium_val
    artwork.params = current_params
    db.commit()
    db.refresh(artwork)

    return {
        "artist_name":    artist_name,
        "artwork_name":   artwork_name,
        "analysis":       extracted_analysis,
        "date":           date_val,
        "medium":         medium_val,
        "movement":       movement_val,
        "period_bucket":  period_bucket_val,
        "tags":           extracted_tags,
        "artwork_id":     str(artwork.id),
        "reference_urls": vision_ref_urls,
    }


@router.delete("/artworks/{artwork_id}")
async def delete_artwork(artwork_id: str, user_id: str = Query(...), db: Session = Depends(get_db)):
    """Delete a saved artwork — caller must supply their user_id for ownership verification."""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    if artwork.user_id != user_id and artwork.device_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this artwork")

    session_id = artwork.session_id
    linked_session_ids = [
        row[0]
        for row in db.query(SessionArtwork.session_id).filter(SessionArtwork.artwork_id == artwork_id).all()
    ]
    db.delete(artwork)
    db.commit()

    # Auto-cleanup legacy empty session
    if session_id:
        remaining = db.query(SavedArtwork).filter(SavedArtwork.session_id == session_id).count()
        linked_remaining = db.query(SessionArtwork).filter(SessionArtwork.session_id == session_id).count()
        if remaining == 0 and linked_remaining == 0:
            session_to_del = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if session_to_del:
                db.delete(session_to_del)
                db.commit()
                logger.info(f"Auto-deleted empty session: {session_id}")

    for linked_session_id in linked_session_ids:
        remaining_legacy = db.query(SavedArtwork).filter(SavedArtwork.session_id == linked_session_id).count()
        remaining_links = db.query(SessionArtwork).filter(SessionArtwork.session_id == linked_session_id).count()
        if remaining_legacy == 0 and remaining_links == 0:
            session_to_del = db.query(SessionModel).filter(SessionModel.id == linked_session_id).first()
            if session_to_del:
                db.delete(session_to_del)
                db.commit()
                logger.info(f"Auto-deleted empty linked session: {linked_session_id}")

    return {"message": "Artwork deleted successfully"}


@router.post("/artworks/{artwork_id}/insights")
async def get_or_create_artwork_insights(
    artwork_id: str,
    language: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return cached insights for an artwork, computing and persisting them if missing."""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()
    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    if artwork.insights:
        return {"insights": artwork.insights}

    artist = artwork.artist_name or ""
    if not artist or artist.lower() in ("unknown", "unknown artist", ""):
        return {"insights": []}

    ai_provider = determine_ai_provider(None)
    ai_service = AIServiceFactory.get_service(ai_provider)
    try:
        points = await ai_service.get_insights(
            artist_name=artist,
            artwork_name=artwork.artwork_name or "Untitled",
            language=language,
        )
    except Exception as e:
        logger.exception("Insights computation failed for %s", artwork_id)
        raise HTTPException(status_code=500, detail=str(e))

    artwork.insights = points
    db.commit()
    return {"insights": points}


@router.post("/artworks/batch-delete")
async def batch_delete_artworks(
    artwork_ids: List[str],
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete multiple artworks (with ownership check)

    - **artwork_ids**: List of artwork IDs
    - **user_id**: User ID (for ownership verification)
    """
    try:
        # Identify affected sessions before deletion
        affected_sessions = db.query(SavedArtwork.session_id).filter(
            SavedArtwork.id.in_(artwork_ids),
            SavedArtwork.user_id == user_id
        ).distinct().all()
        affected_session_ids = {s[0] for s in affected_sessions if s[0]}
        affected_session_ids.update(
            sid for (sid,) in db.query(SessionArtwork.session_id).filter(SessionArtwork.artwork_id.in_(artwork_ids)).distinct().all()
        )

        deleted_count = db.query(SavedArtwork).filter(
            SavedArtwork.id.in_(artwork_ids),
            SavedArtwork.user_id == user_id
        ).delete(synchronize_session=False)

        db.commit()

        # Cleanup empty sessions
        for sid in affected_session_ids:
            remaining = db.query(SavedArtwork).filter(SavedArtwork.session_id == sid).count()
            linked_remaining = db.query(SessionArtwork).filter(SessionArtwork.session_id == sid).count()
            if remaining == 0 and linked_remaining == 0:
                s_to_del = db.query(SessionModel).filter(SessionModel.id == sid).first()
                if s_to_del:
                    db.delete(s_to_del)
                    logger.info(f"Auto-deleted empty session (batch): {sid}")
        
        db.commit()

        return {
            "message": f"Deleted {deleted_count} artworks",
            "deleted_count": deleted_count
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


class SessionMessageIn(BaseModel):
    id: Optional[str] = None
    role: str                          # 'user' | 'model'
    type: str = 'text'                 # 'text' | 'artwork_capture' | 'artwork_card'
    content: Optional[str] = None
    artwork_id: Optional[str] = None
    created_at: Optional[int] = None   # ms epoch from frontend


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Return all messages for a session in sequence order."""
    msgs = (
        db.query(SessionMessage)
        .filter(SessionMessage.session_id == session_id)
        .order_by(SessionMessage.sequence_number)
        .all()
    )
    return [m.to_dict() for m in msgs]


@router.post("/sessions/{session_id}/messages")
async def append_session_messages(
    session_id: str,
    messages: List[SessionMessageIn],
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Append a batch of messages to a session. Skips any id already present."""
    if not messages:
        return {"inserted": 0}

    existing_ids = {
        row[0] for row in db.query(SessionMessage.id)
        .filter(SessionMessage.session_id == session_id)
        .all()
    }
    max_seq = db.query(func.max(SessionMessage.sequence_number)).filter(
        SessionMessage.session_id == session_id
    ).scalar() or 0

    inserted = 0
    for i, msg in enumerate(messages):
        msg_id = msg.id or str(uuid.uuid4())
        if msg_id in existing_ids:
            continue
        db.add(SessionMessage(
            id=msg_id,
            session_id=session_id,
            role=msg.role,
            type=msg.type,
            content=msg.content,
            artwork_id=msg.artwork_id,
            sequence_number=max_seq + i + 1,
        ))
        inserted += 1
    db.commit()
    return {"inserted": inserted}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = Query(...), db: Session = Depends(get_db)):
    """Delete a session and all its associated artworks — caller must supply their user_id."""
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this session")

    # Preserve artworks by detaching any legacy one-to-one links from this session
    db.query(SavedArtwork).filter(SavedArtwork.session_id == session_id).update(
        {SavedArtwork.session_id: None},
        synchronize_session=False,
    )

    # Remove many-to-many session links
    db.query(SessionArtwork).filter(SessionArtwork.session_id == session_id).delete()

    # Delete any session-level messages/history
    db.query(SessionMessage).filter(SessionMessage.session_id == session_id).delete()
    
    # Delete the session record
    db.delete(session_record)
    db.commit()

    logger.info(f"Session {session_id} deleted and artworks detached successfully")
    return {"message": "Session deleted successfully"}


@router.post("/sessions")
async def create_session(
    request: CreateSessionRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Create a session record, or return the existing one if the id already exists for this user."""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        user = User(user_id=user_id, device_id=user_id)
        db.add(user)
        db.flush()

    import uuid as uuid_mod
    session_id = request.session_id or f"sess_{uuid_mod.uuid4().hex[:8]}"
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if session_record:
        if session_record.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this session")
        return {
            "message": "Session already exists",
            "session": session_record.to_dict(),
        }

    session_record = SessionModel(
        id=session_id,
        user_id=user_id,
        title=(request.title or "Untitled Session").strip() or "Untitled Session",
    )
    db.add(session_record)
    db.commit()
    db.refresh(session_record)

    return {
        "message": "Session created successfully",
        "session": session_record.to_dict(),
    }


@router.post("/sessions/{session_id}/artworks")
async def attach_artworks_to_session(
    session_id: str,
    request: AttachSessionArtworksRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this session")

    artwork_ids = [artwork_id for artwork_id in request.artwork_ids if artwork_id]
    if not artwork_ids:
        return {"inserted": 0, "artworks": []}
    if len(artwork_ids) > SESSION_ARTWORK_LIMIT:
        raise HTTPException(status_code=400, detail=f"At most {SESSION_ARTWORK_LIMIT} artworks can be attached at once")

    artworks = db.query(SavedArtwork).filter(
        SavedArtwork.id.in_(artwork_ids),
        SavedArtwork.user_id == user_id,
    ).all()
    artwork_by_id = {art.id: art for art in artworks}
    missing_ids = [artwork_id for artwork_id in artwork_ids if artwork_id not in artwork_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Artwork not found or not owned: {missing_ids[0]}")

    current_max_seq = db.query(func.max(SessionArtwork.sequence_number)).filter(
        SessionArtwork.session_id == session_id
    ).scalar() or 0

    inserted = 0
    for offset, artwork_id in enumerate(artwork_ids, start=1):
        existing = db.query(SessionArtwork).filter(
            SessionArtwork.session_id == session_id,
            SessionArtwork.artwork_id == artwork_id,
        ).first()
        if existing:
            continue
        _ensure_session_artwork_link(
            db,
            session_id=session_id,
            artwork_id=artwork_id,
            source="library",
            sequence_number=current_max_seq + offset,
        )
        inserted += 1

    db.commit()

    linked_artworks = (
        db.query(SavedArtwork)
        .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
        .filter(SessionArtwork.session_id == session_id)
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )
    return {
        "inserted": inserted,
        "artworks": [art.to_dict(include_conversations=False) for art in linked_artworks],
    }


@router.get("/sessions/{session_id}/artworks")
async def get_session_artworks(
    session_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")
    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this session")

    linked_artworks = (
        db.query(SavedArtwork)
        .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
        .filter(SessionArtwork.session_id == session_id)
        .order_by(SessionArtwork.sequence_number.asc())
        .all()
    )

    if linked_artworks:
        return {"items": [art.to_dict(include_conversations=False) for art in linked_artworks]}

    legacy_artworks = (
        db.query(SavedArtwork)
        .filter(SavedArtwork.session_id == session_id, SavedArtwork.user_id == user_id)
        .order_by(SavedArtwork.created_at.asc())
        .all()
    )
    return {"items": [art.to_dict(include_conversations=False) for art in legacy_artworks]}


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Rename a session — caller must supply their user_id."""
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_record.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this session")

    next_title = request.title.strip()
    if not next_title:
        raise HTTPException(status_code=400, detail="Session title cannot be empty")

    session_record.title = next_title
    db.commit()
    db.refresh(session_record)

    return {
        "message": "Session updated successfully",
        "session": session_record.to_dict(),
    }


@router.patch("/sessions/{session_id}/goal")
async def set_session_goal(
    session_id: str,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Store the user's stated goal/intent for a session in metadata_json."""
    goal = (body.get("goal") or "").strip()
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")
    meta = dict(session_record.metadata_json or {})
    meta["user_goal"] = goal
    session_record.metadata_json = meta
    db.commit()
    return {"ok": True}


# =============================================================================
# Session Memory Helpers
# =============================================================================


async def get_session_context(session_id: str) -> Optional[Dict[str, Any]]:
    """Helper to get previous artwork context for a session"""

    def sync_get_context():
        with SessionLocal() as db:
            session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if not session_record:
                return None
            
            linked_artworks = (
                db.query(SavedArtwork)
                .join(SessionArtwork, SessionArtwork.artwork_id == SavedArtwork.id)
                .filter(SessionArtwork.session_id == session_id)
                .order_by(SessionArtwork.sequence_number.asc())
                .all()
            )
            artworks = linked_artworks or db.query(SavedArtwork).filter(
                SavedArtwork.session_id == session_id
            ).order_by(SavedArtwork.created_at).all()
            
            if not artworks and not session_record.narrative_summary:
                return None

            user_goal = (session_record.metadata_json or {}).get("user_goal")
            return {
                "narrative_summary": session_record.narrative_summary,
                "user_goal": user_goal,
                "previous_artworks": [
                    {
                        "artist": art.artist_name,
                        "title": art.artwork_name,
                        "analysis": art.analysis,
                        "tags": [tag.name for tag in art.artwork_tags]
                    }
                    for art in artworks
                ]
            }
    
    return await anyio.to_thread.run_sync(sync_get_context)

async def update_session_narrative_task(
    session_id: str, 
    new_artwork_data: Dict[str, Any], 
    identity: str = "default",
    language: Optional[str] = None
):
    """Background task to update session narrative distilled from all artworks"""
    with SessionLocal() as db:
        session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session_record:
            return
            
        # Determine AI provider to use
        ai_provider = determine_ai_provider()
        ai_service = AIServiceFactory.get_service(ai_provider)
        
        updated_narrative = await ai_service.summarize_session_narrative(
            previous_narrative=session_record.narrative_summary,
            new_artwork_data=new_artwork_data,
            identity=identity,
            language=language
        )
        
        session_record.narrative_summary = updated_narrative
        db.commit()
        logger.info(f"Updated narrative for session {session_id}")
