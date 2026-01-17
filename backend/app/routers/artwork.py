from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
import json
import logging
import re
import time
from datetime import datetime

from app.database.connection import get_db
from app.database.models import SavedArtwork, Conversation, Tag, User
from app.models.artwork import AIProvider, UpdateArtworkRequest
from app.services.ai_service import AIServiceFactory
from app.services.openai_api_client import OpenAIAPIClient
from app.services.claude_api_client import ClaudeAPIClient
from app.services.gemini_api_client import GeminiAPIClient
from app.services.photoroom_service import photoroom_service
from app.utils.image_processing import process_image
from app.services.storage import get_storage_service, StorageFactory
from app.config.settings import settings
from app.utils.conversation_storage import ConversationMessage

router = APIRouter()
logger = logging.getLogger(__name__)


# Initialize and register AI clients
def initialize_ai_services():
    """Initialize available AI clients based on configuration"""
    try:
        if settings.openai_api_key:
            AIServiceFactory.register_client(AIProvider.OPENAI, OpenAIAPIClient())
            logger.info("OpenAI client initialized successfully")
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


def batch_link_tags(db: Session, artwork: SavedArtwork, tags_str: str):
    """Link tags from a comma-separated string to an artwork (batch query)

    Tags are global (not user-specific). Creates new tags if they don't exist.
    """
    if not tags_str:
        return

    # Normalize all tag names
    tag_names = [normalize_tag_name(t) for t in tags_str.split(',') if t.strip()]
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
    client_type: Optional[str] = Form(None),  # "web" or "ios" - helps determine storage strategy
    db: Session = Depends(get_db)
):
    """
    Analyze artwork image to identify artist

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **model**: Preferred AI model (openai, claude, gemini)
    - **identity**: AI identity/persona
    - **language**: Language code for response
    - **user_id**: If provided, saves artwork to DB and returns artwork_id
    - **photo_uri**: URI/path for the photo (iOS clients provide local path)
    - **client_type**: "web" or "ios" - web clients will have images stored on server
    """
    ai_provider = determine_ai_provider(model)

    try:
        image_bytes = await process_image(image)
        ai_service = AIServiceFactory.get_service(ai_provider)
        analysis_text = await ai_service.identify_artist(
            image_bytes, identity=identity, language=language
        )

        response = {
            "analysis": analysis_text,
            "model_used": ai_provider.value
        }

        # If user_id provided, save to DB
        if user_id:
            # Ensure user exists (auto-create if not)
            user = db.query(User).filter(User.user_id == user_id).first()
            if not user:
                # Create user with specified user_id (overrides default UUID)
                user = User(user_id=user_id, device_id=user_id)
                db.add(user)
                db.flush()
                logger.info(f"Auto-created user: {user_id}")

            # Parse analysis to extract artist/artwork info
            artist_name = "Unknown Artist"
            artwork_name = "Untitled"
            tags_str = ""

            # Try to parse the analysis JSON
            try:
                import re
                json_str = analysis_text

                # Extract JSON from markdown code blocks if present
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', analysis_text)
                if json_match:
                    json_str = json_match.group(1).strip()

                parsed = json.loads(json_str)

                # Handle array format: [artistGuess1, artistGuess2, ..., {analysis, tags}]
                if isinstance(parsed, list) and len(parsed) > 0:
                    # Find best artist guess (first item with artist_name and score)
                    artist_info = next(
                        (item for item in parsed if isinstance(item, dict) and 'artist_name' in item and 'score' in item),
                        parsed[0] if isinstance(parsed[0], dict) else {}
                    )
                    artist_name = artist_info.get('artist_name', artist_name)
                    artwork_name = artist_info.get('artwork_name', artwork_name)

                    # Find analysis info (item with 'analysis' and 'tags')
                    analysis_info = next(
                        (item for item in parsed if isinstance(item, dict) and 'analysis' in item),
                        {}
                    )
                    tags_str = analysis_info.get('tags', '')

                    logger.info(f"Parsed artwork: {artist_name} - {artwork_name}, tags: {tags_str}")
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
                logger.warning(f"Failed to parse analysis for DB save: {e}")

            # Generate photo_uri based on client type
            if photo_uri:
                # iOS client provided local path
                generated_photo_uri = photo_uri
            elif client_type == "web" or not photo_uri:
                # Web client or no photo_uri - save image using configured storage
                storage = get_storage_service()
                generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
                logger.info(f"Saved web upload to: {generated_photo_uri}")
            else:
                # Fallback: generate placeholder URI
                import uuid as uuid_mod
                generated_photo_uri = f"artwork_{uuid_mod.uuid4().hex[:12]}"

            # Create artwork record
            saved_artwork = SavedArtwork(
                photo_uri=generated_photo_uri,
                artist_name=artist_name,
                artwork_name=artwork_name,
                user_id=user_id,
                is_recognized=1 if artist_name != "Unknown Artist" else 0,
                analysis=analysis_text
            )
            db.add(saved_artwork)

            # Link tags if parsed
            if tags_str:
                db.flush()  # Get the artwork ID
                batch_link_tags(db, saved_artwork, tags_str)

            db.commit()
            db.refresh(saved_artwork)

            response["artwork_id"] = str(saved_artwork.id)
            response["artist_name"] = artist_name
            response["artwork_name"] = artwork_name
            response["photo_uri"] = generated_photo_uri  # For web clients, this is the server path

        return response

    except Exception as e:
        logger.error(f"Error in analyze_artist: {str(e)}", exc_info=True)
        db.rollback()
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/artwork-analyze-stream")
async def analyze_artist_stream(
    image: UploadFile = File(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    language: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    photo_uri: Optional[str] = Form(None),
    client_type: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Stream artwork analysis with SSE (Server-Sent Events)

    Returns streaming text chunks as 'chunk' events, followed by a 'complete' event
    with the full result including artwork_id if user_id was provided.

    SSE Format:
    - event: chunk, data: {"type": "text", "content": "..."}
    - event: complete, data: {"type": "result", "artist_name": "...", ...}
    - event: metrics, data: {"type": "metrics", ...}
    """
    # TIMING: Request received
    t_request_received = time.time()
    request_id = f"stream_{int(t_request_received * 1000)}"
    logger.info(f"[{request_id}] METRIC: request_received")

    ai_provider = determine_ai_provider(model)

    try:
        image_bytes = await process_image(image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing failed: {str(e)}")

    # TIMING: Image processed
    t_image_processed = time.time()
    logger.info(f"[{request_id}] METRIC: image_processed, elapsed={(t_image_processed - t_request_received)*1000:.0f}ms")

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
            logger.info(f"[{request_id}] METRIC: ai_service_called, elapsed={(t_ai_call - t_request_received)*1000:.0f}ms")

            # Stream the analysis text
            async for chunk in ai_service.identify_artist_stream(
                image_bytes, identity=identity, language=language
            ):
                # TIMING: First chunk received
                if not first_chunk_received:
                    t_first_chunk = time.time()
                    first_chunk_received = True
                    time_to_first_chunk = (t_first_chunk - t_ai_call) * 1000
                    logger.info(f"[{request_id}] METRIC: first_chunk_received, ttfc={time_to_first_chunk:.0f}ms, total_elapsed={(t_first_chunk - t_request_received)*1000:.0f}ms")

                full_text += chunk
                # Send chunk as SSE event
                event_data = json.dumps({"type": "text", "content": chunk})
                yield f"event: chunk\ndata: {event_data}\n\n"

            # TIMING: Streaming finished
            t_streaming_done = time.time()
            streaming_duration = (t_streaming_done - t_first_chunk) * 1000 if t_first_chunk else 0
            logger.info(f"[{request_id}] METRIC: streaming_finished, streaming_duration={streaming_duration:.0f}ms, total_elapsed={(t_streaming_done - t_request_received)*1000:.0f}ms")

            # Parse the full response to extract metadata
            artist_name = "Unknown Artist"
            artwork_name = "Untitled"
            tags_str = ""
            description = ""

            try:
                json_str = full_text

                # Extract JSON from markdown code blocks if present
                json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', full_text)
                if json_match:
                    json_str = json_match.group(1).strip()

                parsed = json.loads(json_str)

                # Handle array format: [artistGuess1, artistGuess2, ..., {analysis, tags}]
                if isinstance(parsed, list) and len(parsed) > 0:
                    # Find best artist guess
                    artist_info = next(
                        (item for item in parsed if isinstance(item, dict) and 'artist_name' in item and 'score' in item),
                        parsed[0] if isinstance(parsed[0], dict) else {}
                    )
                    artist_name = artist_info.get('artist_name', artist_name)
                    artwork_name = artist_info.get('artwork_name', artwork_name)

                    # Find analysis info
                    analysis_info = next(
                        (item for item in parsed if isinstance(item, dict) and 'analysis' in item),
                        {}
                    )
                    tags_str = analysis_info.get('tags', '')
                    description = analysis_info.get('analysis', '')

                    logger.info(f"[{request_id}] Parsed streaming artwork: {artist_name} - {artwork_name}")
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as e:
                logger.warning(f"[{request_id}] Failed to parse streaming analysis: {e}")

            # Build result
            result = {
                "type": "result",
                "artist_name": artist_name,
                "artwork_name": artwork_name,
                "description": description,
                "tags": tags_str,
                "analysis": full_text,
                "model_used": ai_provider.value
            }

            # If user_id provided, save to DB
            if user_id:
                try:
                    # Ensure user exists
                    user = db.query(User).filter(User.user_id == user_id).first()
                    if not user:
                        user = User(user_id=user_id, device_id=user_id)
                        db.add(user)
                        db.flush()
                        logger.info(f"Auto-created user: {user_id}")

                    # Generate photo_uri based on client type
                    if photo_uri:
                        generated_photo_uri = photo_uri
                    elif client_type == "web" or not photo_uri:
                        storage = get_storage_service()
                        generated_photo_uri = await storage.save(image_bytes, "artwork.jpg", user_id)
                        logger.info(f"Saved web upload to: {generated_photo_uri}")
                    else:
                        import uuid as uuid_mod
                        generated_photo_uri = f"artwork_{uuid_mod.uuid4().hex[:12]}"

                    # Create artwork record
                    saved_artwork = SavedArtwork(
                        photo_uri=generated_photo_uri,
                        artist_name=artist_name,
                        artwork_name=artwork_name,
                        user_id=user_id,
                        is_recognized=1 if artist_name != "Unknown Artist" else 0,
                        analysis=full_text
                    )
                    db.add(saved_artwork)

                    # Link tags if parsed
                    if tags_str:
                        db.flush()
                        batch_link_tags(db, saved_artwork, tags_str)

                    db.commit()
                    db.refresh(saved_artwork)

                    result["artwork_id"] = str(saved_artwork.id)
                    result["photo_uri"] = generated_photo_uri
                except Exception as e:
                    logger.error(f"Failed to save artwork to DB: {e}")
                    db.rollback()

            # Send complete event
            yield f"event: complete\ndata: {json.dumps(result)}\n\n"

            # TIMING: Request finished
            t_request_done = time.time()
            total_duration = (t_request_done - t_request_received) * 1000
            logger.info(f"[{request_id}] METRIC: request_finished, total_duration={total_duration:.0f}ms")

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

        # Fail if both image and artwork_id are missing
        if not image and not artwork_id:
            raise HTTPException(
                status_code=400, 
                detail="Must provide either an image or an artwork_id (session context)"
            )

        image_bytes = None
        if image:
            image_bytes = await process_image(image)

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

            # Get next sequence number
            next_seq = len(conversations)

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

        # Call LLM
        ai_service = AIServiceFactory.get_service(ai_provider)
        bite_text = await ai_service.get_artwork_bite(
            image_bytes,
            artist_name or "Unknown Artist",
            artwork_name or "Unknown",
            user_message,
            previous_messages,
            identity=identity,
            language=language
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
        image_bytes = await process_image(image)

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
# Artwork CRUD Endpoints
# =============================================================================

@router.post("/save-artwork")
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
    db: Session = Depends(get_db)
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
            photo_time=photo_time
        )
        db.add(saved_artwork)
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

        return saved_artwork.to_dict()

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save artwork: {str(e)}")


@router.get("/save-artwork")
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
            "items": [a.to_dict(include_conversations=False) for a in artworks],
            "count": len(artworks),
            "offset": offset,
            "limit": limit
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve artworks: {str(e)}")


@router.get("/save-artwork/{artwork_id}")
async def get_artwork(artwork_id: str, db: Session = Depends(get_db)):
    """Get a specific artwork with full conversation history"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    return artwork.to_dict()


@router.put("/save-artwork/{artwork_id}")
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


@router.delete("/save-artwork/{artwork_id}")
async def delete_artwork(artwork_id: str, db: Session = Depends(get_db)):
    """Delete a saved artwork"""
    artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

    if not artwork:
        raise HTTPException(status_code=404, detail="Artwork not found")

    db.delete(artwork)
    db.commit()

    return {"message": "Artwork deleted successfully"}


@router.post("/save-artwork/batch-delete")
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
        deleted_count = db.query(SavedArtwork).filter(
            SavedArtwork.id.in_(artwork_ids),
            SavedArtwork.user_id == user_id
        ).delete(synchronize_session=False)

        db.commit()

        return {
            "message": f"Deleted {deleted_count} artworks",
            "deleted_count": deleted_count
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")
