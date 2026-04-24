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
from datetime import datetime
import anyio

from app.database.connection import get_db, SessionLocal
from app.database.models import SavedArtwork, Conversation, Tag, User, Session as SessionModel, SkillEvent
from app.models.artwork import AIProvider, UpdateArtworkRequest
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
from app.utils.conversation_storage import ConversationMessage

router = APIRouter()
logger = logging.getLogger(__name__)

# Skill name → category map (mirrors ArtSkillsView.tsx)
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
    background_tasks: BackgroundTasks = None
):
    """
    Analyze artwork image to identify artist
    """
    # Enforce session_id existence
    if not session_id:
        import uuid as uuid_mod
        session_id = f"sess_{uuid_mod.uuid4().hex[:8]}"
        logger.info(f"Auto-generated session_id for standalone upload: {session_id}")
    ai_provider = determine_ai_provider(model)
    logger.info(f"analyze_artist received session_id: {session_id}, user_id: {user_id}")

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

        # Run Vision API and session context fetch in parallel
        session_context = None
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
                    s_id = s_id or f"sess_{uuid.uuid4().hex[:8]}"
                    sess_record = local_db.query(SessionModel).filter(SessionModel.id == s_id).first()
                    if not sess_record:
                        # Determine initial title from location
                        initial_title = "Personal Visit"
                        if loc:
                            try:
                                loc_data = json.loads(loc) if isinstance(loc, str) else loc
                                initial_title = loc_data.get("museum") or loc_data.get("city") or initial_title
                            except: pass
                        
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
                    local_db.commit()
                    local_db.refresh(art)
                    return str(art.id)

            artwork_id = await anyio.to_thread.run_sync(
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
    # Enforce session_id existence
    if not session_id:
        import uuid as uuid_mod
        session_id = f"sess_{uuid_mod.uuid4().hex[:8]}"
        logger.info(f"Auto-generated session_id for streaming upload: {session_id}")
    # TIMING: Request received
    t_request_received = time.time()
    request_id = f"stream_{int(t_request_received * 1000)}"

    ai_provider = determine_ai_provider(model)

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

    async def event_generator():
        nonlocal t_request_received, t_image_processed, request_id

        full_text = ""
        ai_service = AIServiceFactory.get_service(ai_provider)
        first_chunk_received = False
        t_ai_call = None
        t_first_chunk = None
        t_streaming_done = None

        try:
            # TIMING: Call AI service
            t_ai_call = time.time()

            # Run Vision API and session context fetch in parallel
            (vision_hint, vision_ref_urls), session_context = await asyncio.gather(
                get_vision_hint(image_bytes),
                get_session_context(session_id) if session_id else asyncio.sleep(0, result=None),
            )

            # Stream the analysis text
            async for chunk in ai_service.identify_artist_stream(
                image_bytes, identity=identity, language=language, session_context=session_context,
                reasoning_effort=reasoning_effort, vision_hint=vision_hint,
            ):
                # TIMING: First chunk received
                if not first_chunk_received:
                    t_first_chunk = time.time()
                    first_chunk_received = True
                    time_to_first_chunk = (t_first_chunk - t_ai_call) * 1000

                full_text += chunk
                # Send chunk as SSE event
                event_data = json.dumps({"type": "text", "content": chunk})
                yield f"event: chunk\ndata: {event_data}\n\n"

            # TIMING: Streaming finished
            t_streaming_done = time.time()
            streaming_duration = (t_streaming_done - t_first_chunk) * 1000 if t_first_chunk else 0

            # Parse the full response to extract metadata
            artist_name = "Unknown Artist"
            artwork_name = "Untitled"
            extracted_tags = []
            description = ""
            date_val = None
            medium_val = None
            movement_val = None
            period_bucket_val = None

            try:
                json_str = full_text

                # Extract JSON from markdown code blocks if present
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', full_text)
                if json_match:
                    json_str = json_match.group(1).strip()

                parsed = json.loads(json_str)

                # Handle the new structured object format
                if isinstance(parsed, dict):
                    artist_name = parsed.get('artist', artist_name)
                    artwork_name = parsed.get('title', artwork_name)
                    extracted_tags = parsed.get('tags', [])
                    description = parsed.get('description', '')
                    date_val = parsed.get('date')
                    medium_val = parsed.get('medium')
                    movement_val = parsed.get('movement')
                    period_bucket_val = parsed.get('period_bucket')

                # Fallback for old array format
                elif isinstance(parsed, list) and len(parsed) > 0:
                    artist_info = next(
                        (item for item in parsed if isinstance(item, dict) and 'artist_name' in item),
                        parsed[0] if isinstance(parsed[0], dict) else {}
                    )
                    artist_name = artist_info.get('artist_name', artist_name)
                    artwork_name = artist_info.get('artwork_name', artwork_name)

                    analysis_info = next(
                        (item for item in parsed if isinstance(item, dict) and 'analysis' in item),
                        {}
                    )
                    extracted_tags = analysis_info.get('tags', [])
                    description = analysis_info.get('analysis', '')
                    date_val = artist_info.get('date') or analysis_info.get('date')
                    medium_val = artist_info.get('medium') or analysis_info.get('medium')

                logger.info(f"[{request_id}] Parsed streaming artwork: {artist_name} - {artwork_name}, tags: {extracted_tags}")
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
                logger.warning(f"[{request_id}] Failed to parse streaming analysis: {e}")

            # Build result
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
                "photo_time": photo_time
            }

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

            # Create artwork record in a thread Safe way
            def _save_streaming_artwork_sync(
                u_id, s_id, p_uri, a_name, w_name, desc, full_txt, d_val, m_val, tags, loc, p_time, mv_val, pb_val, ref_urls
            ):
                with SessionLocal() as local_db:
                    # Ensure user exists
                    usr = local_db.query(User).filter(User.user_id == u_id).first()
                    if not usr:
                        usr = User(user_id=u_id, device_id=u_id)
                        local_db.add(usr)
                        local_db.flush()

                    # Ensure session exists (Mandatory in Visit-Only Architecture)
                    s_id = s_id or f"sess_{uuid.uuid4().hex[:8]}"
                    sess_record = local_db.query(SessionModel).filter(SessionModel.id == s_id).first()
                    if not sess_record:
                        # Determine initial title from location
                        initial_title = "Personal Visit"
                        if loc:
                            try:
                                loc_data = json.loads(loc) if isinstance(loc, str) else loc
                                initial_title = loc_data.get("museum") or loc_data.get("city") or initial_title
                            except: pass

                        sess_record = SessionModel(
                            id=s_id, 
                            user_id=u_id or "anonymous",
                            title=initial_title
                        )
                        local_db.add(sess_record)
                        local_db.flush()

                    # Create artwork record
                    art = SavedArtwork(
                        photo_uri=p_uri,
                        artist_name=a_name,
                        artwork_name=w_name,
                        user_id=u_id,
                        is_recognized=1 if a_name != "Unknown Artist" else 0,
                        analysis=desc or full_txt,
                        params={"date": d_val, "medium": m_val},
                        session_id=s_id,
                        location=loc,
                        photo_time=p_time,
                        movement=mv_val,
                        period_bucket=pb_val,
                        reference_urls=ref_urls or [],
                    )
                    local_db.add(art)

                    # Link tags if parsed
                    if tags:
                        local_db.flush()
                        batch_link_tags(local_db, art, tags)

                    local_db.commit()
                    local_db.refresh(art)
                    return str(art.id)

            artwork_id = await anyio.to_thread.run_sync(
                _save_streaming_artwork_sync,
                user_id,
                session_id,
                generated_photo_uri,
                artist_name,
                artwork_name,
                description,
                full_text,
                date_val,
                medium_val,
                extracted_tags,
                parsed_location,
                photo_time,
                movement_val,
                period_bucket_val,
                vision_ref_urls,
            )
            result["artwork_id"] = artwork_id
            result["photo_uri"] = generated_photo_uri
            result["reference_urls"] = vision_ref_urls

            # Update session narrative in background
            if session_id and background_tasks:
                background_tasks.add_task(
                    update_session_narrative_task,
                    session_id=session_id,
                    new_artwork_data={
                        "artist": artist_name,
                        "title": artwork_name,
                        "description": description or full_text
                    },
                    identity=identity,
                    language=language
                )
            
            # TIMING: Request finished
            t_request_done = time.time()
            total_duration = (t_request_done - t_request_received) * 1000

            # Build and send metrics event for frontend consumption
            metrics = {
                "type": "metrics",
                "request_id": request_id,
                "timings": {
                    "image_processing_ms": round((t_image_processed - t_request_received) * 1000),
                    "time_to_ai_call_ms": round((t_ai_call - t_request_received) * 1000) if t_ai_call else None,
                    "time_to_first_chunk_ms": round((t_first_chunk - t_request_received) * 1000) if t_first_chunk else None,
                    "ai_first_chunk_latency_ms": round((t_first_chunk - t_ai_call) * 1000) if t_first_chunk and t_ai_call else None,
                    "streaming_duration_ms": round((t_streaming_done - t_first_chunk) * 1000) if t_streaming_done and t_first_chunk else None,
                    "total_duration_ms": round(total_duration)
                },
                "model": ai_provider.value
            }
            logger.info(f"[{request_id}] METRIC_SUMMARY: {json.dumps(metrics['timings'])}")
            yield f"event: metrics\ndata: {json.dumps(metrics)}\n\n"

            yield f"event: complete\ndata: {json.dumps(result)}\n\n"

        except Exception as e:
            logger.error(f"[{request_id}] Streaming error: {str(e)}", exc_info=True)
            error_data = json.dumps({"type": "error", "message": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
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
# Web-client AI endpoints (exhibition chat works with all providers; define term & TTS are Gemini-only)
# =============================================================================

class ExhibitionItem(BaseModel):
    id: str
    url: str
    keywords: List[str] = []

class ExhibitionChatRequest(BaseModel):
    items: List[ExhibitionItem]
    conversation_history: List[Dict[str, str]]  # [{role, content}]
    new_message: str

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
        _conn.commit()
    return {"status": "ok", "message": "Migrations applied"}


@router.get("/taste-profile")
async def get_taste_profile(user_id: str, db: Session = Depends(get_db)):
    """Return taste profile computed from skill_stats + saved artwork collection."""
    from sqlalchemy import func as sqlfunc

    user = db.query(User).filter(User.user_id == user_id).first()
    skill_stats_raw: dict = dict(user.skill_stats or {}) if user else {}

    # Enrich each skill entry with level
    skill_stats: dict = {}
    for name, entry in skill_stats_raw.items():
        e = dict(entry)
        e["level"] = _xp_to_level(e.get("xp", 0))
        skill_stats[name] = e

    # Top skills by XP
    top_skills = sorted(
        [{"name": k, "cat": _SKILL_CAT.get(k, "STRUCTURE"), **v} for k, v in skill_stats.items()],
        key=lambda x: x["xp"], reverse=True
    )[:5]

    # Dominant category by total XP per category
    cat_xp: dict[str, int] = {}
    for name, entry in skill_stats.items():
        cat = _SKILL_CAT.get(name, "STRUCTURE")
        cat_xp[cat] = cat_xp.get(cat, 0) + entry.get("xp", 0)
    dominant_cat = max(cat_xp, key=lambda c: cat_xp[c]) if cat_xp else None

    identity_label, identity_desc = _IDENTITY_LABELS.get(dominant_cat, _IDENTITY_LABELS[None])

    # Artwork collection stats
    total_artworks = db.query(SavedArtwork).filter(SavedArtwork.user_id == user_id).count()

    top_movements = [
        {"movement": row[0], "count": row[1]}
        for row in db.query(SavedArtwork.movement, sqlfunc.count().label("count"))
            .filter(SavedArtwork.user_id == user_id, SavedArtwork.movement != None)
            .group_by(SavedArtwork.movement)
            .order_by(sqlfunc.count().desc())
            .limit(5)
    ]

    top_periods = [
        {"period": row[0], "count": row[1]}
        for row in db.query(SavedArtwork.period_bucket, sqlfunc.count().label("count"))
            .filter(SavedArtwork.user_id == user_id, SavedArtwork.period_bucket != None)
            .group_by(SavedArtwork.period_bucket)
            .order_by(sqlfunc.count().desc())
    ]

    total_explore_events = db.query(SkillEvent).filter(SkillEvent.user_id == user_id).count()

    return {
        "user_id": user_id,
        "total_artworks": total_artworks,
        "total_explore_events": total_explore_events,
        "identity_label": identity_label,
        "identity_description": identity_desc,
        "dominant_category": dominant_cat,
        "skill_stats": skill_stats,
        "top_skills": top_skills,
        "top_movements": top_movements,
        "top_periods": top_periods,
    }


@router.post("/exhibition-chat")
async def exhibition_chat(
    request: ExhibitionChatRequest = Body(...),
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
        response_text = await ai_service.exhibition_chat(
            items=[{"keywords": i.keywords} for i in request.items],
            history=request.conversation_history,
            new_message=request.new_message,
            image_bytes_list=image_bytes_list,
        )
        return {"response": response_text}
    except Exception as e:
        logger.exception("Exhibition chat failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/exhibition-chat-stream")
async def exhibition_chat_stream(
    request: ExhibitionChatRequest = Body(...),
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
            async for chunk in ai_service.exhibition_chat_stream(
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

class UnlockPointsRequest(BaseModel):
    artist_name: str
    artwork_name: str
    language: Optional[str] = None

@router.post("/artwork-unlock-points")
async def artwork_unlock_points(
    request: UnlockPointsRequest = Body(...),
    model: Optional[AIProvider] = Query(None),
):
    """Return 0–3 unlock points anchored on the artist's known biography/intent."""
    if not request.artist_name or request.artist_name.lower() in ("unknown", "unknown artist", ""):
        return {"points": []}
    ai_provider = determine_ai_provider(model)
    ai_service = AIServiceFactory.get_service(ai_provider)
    try:
        points = await ai_service.get_unlock_points(
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

@router.post("/artworks")
async def save_artwork(
    photo_uri: str = Form(...),
    artist_name: str = Form(...),
    artwork_name: str = Form(...),
    conversation_history: str = Form(...),
    user_id: str = Form(...),
    location: Optional[str] = Form(None),
    museum_name: Optional[str] = Form(None),
    is_recognized: bool = Form(True),
    tags: Optional[str] = Form(None),
    analysis: Optional[str] = Form(None),
    summary: Optional[str] = Form(None),
    params: Optional[str] = Form(None),
    photo_time: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """
    Save a new artwork with conversation history

    - **photo_uri**: URI/path to the photo
    - **artist_name**: Name of the artist
    - **artwork_name**: Name of the artwork
    - **conversation_history**: JSON array of [{role, content}, ...]
    - **user_id**: User ID (required)
    - **location**: Geographic location (optional)
    - **museum_name**: Museum name (optional)
    - **is_recognized**: Whether artwork was recognized
    - **tags**: Comma-separated tags
    - **analysis**: AI analysis text
    - **summary**: One-sentence summary
    - **params**: JSON string of additional parameters
    - **photo_time**: Original photo capture time
    - **session_id**: Optional session ID for thematic grouping
    """
    try:
        # Parse JSON fields
        conversation_data = json.loads(conversation_history)

        params_data = None
        if params:
            try:
                params_data = json.loads(params)
            except json.JSONDecodeError:
                logger.warning("Failed to parse params JSON")

        # Ensure user exists (auto-create if not)
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            user = User(user_id=user_id, device_id=user_id)
            db.add(user)
            db.flush()
            logger.info(f"Auto-created user from save_artwork: {user_id}")

        # Create artwork
        saved_artwork = SavedArtwork(
            photo_uri=photo_uri,
            artist_name=artist_name,
            artwork_name=artwork_name,
            user_id=user_id,
            location=location,
            museum_name=museum_name,
            is_recognized=1 if is_recognized else 0,
            analysis=analysis,
            summary=summary,
            params=params_data,
            photo_time=photo_time,
            session_id=session_id
        )
        db.add(saved_artwork)
        
        # Ensure session exists (auto-create if not)
        if session_id:
            session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if not session_record:
                session_record = SessionModel(id=session_id, user_id=user_id)
                db.add(session_record)
                logger.info(f"Auto-created session from save_artwork: {session_id}")

        db.flush()

        # Link tags (batch operation)
        if tags:
            batch_link_tags(db, saved_artwork, tags)

        # Create conversation records
        for idx, message in enumerate(conversation_data):
            content = message.get('content', '')
            if not content:
                continue

            conversation = Conversation(
                saved_artwork_id=saved_artwork.id,
                sequence_number=idx,
                role=message.get('role', 'assistant'),
                content=content,
                message_metadata={"topic": message['topic']} if 'topic' in message else None
            )
            db.add(conversation)

        db.commit()
        db.refresh(saved_artwork)

        # Update session narrative in background
        if session_id and background_tasks:
            background_tasks.add_task(
                update_session_narrative_task,
                session_id=session_id,
                new_artwork_data={
                    "artist": artist_name,
                    "title": artwork_name,
                    "description": analysis or summary
                }
            )

        return saved_artwork.to_dict()

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save artwork: {str(e)}")


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


@router.get("/artworks/{artwork_id}")
async def get_artwork(artwork_id: str, db: Session = Depends(get_db)):
    """Get a specific artwork with full conversation history"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    return artwork.to_dict()


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
async def delete_artwork(artwork_id: str, db: Session = Depends(get_db)):
    """Delete a saved artwork"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    session_id = artwork.session_id
    db.delete(artwork)
    db.commit()

    # Auto-cleanup: if session is now empty, delete it
    if session_id:
        remaining = db.query(SavedArtwork).filter(SavedArtwork.session_id == session_id).count()
        if remaining == 0:
            session_to_del = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            if session_to_del:
                db.delete(session_to_del)
                db.commit()
                logger.info(f"Auto-deleted empty session: {session_id}")

    return {"message": "Artwork deleted successfully"}


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
        affected_session_ids = [s[0] for s in affected_sessions if s[0]]

        deleted_count = db.query(SavedArtwork).filter(
            SavedArtwork.id.in_(artwork_ids),
            SavedArtwork.user_id == user_id
        ).delete(synchronize_session=False)

        db.commit()

        # Cleanup empty sessions
        for sid in affected_session_ids:
            remaining = db.query(SavedArtwork).filter(SavedArtwork.session_id == sid).count()
            if remaining == 0:
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


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a session and all its associated artworks"""
    session_record = db.query(SessionModel).filter(SessionModel.id == session_id).first()

    if not session_record:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete all artworks in this session
    db.query(SavedArtwork).filter(SavedArtwork.session_id == session_id).delete()
    
    # Delete the session record
    db.delete(session_record)
    db.commit()

    logger.info(f"Session {session_id} and all its artworks deleted successfully")
    return {"message": "Session deleted successfully"}


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
            
            # Get previous artworks in this session (ordered by creation)
            artworks = db.query(SavedArtwork).filter(
                SavedArtwork.session_id == session_id
            ).order_by(SavedArtwork.created_at).all()
            
            if not artworks and not session_record.narrative_summary:
                return None

            return {
                "narrative_summary": session_record.narrative_summary,
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
