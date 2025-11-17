from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from typing import Optional
import os
import json

from app.database.connection import get_db
from app.database.models import SavedArtwork, Conversation
from app.models.artwork import ToneType, AIProvider, UpdateArtworkRequest
from app.services.ai_service import AIServiceFactory
from app.services.openai_client import OpenAIClient
from app.services.claude_client import ClaudeClient
from app.services.gemini_client import GeminiClient
from app.services.photoroom_service import photoroom_service
from app.utils.image_processing import process_image
from app.config.settings import settings
from app.utils.conversation_storage import ConversationMessage

router = APIRouter()

# Initialize and register AI services
def initialize_ai_services():
    """Initialize available AI services based on configuration"""
    try:
        if settings.openai_api_key:
            AIServiceFactory.register_service(AIProvider.OPENAI, OpenAIClient())
    except Exception as e:
        print(f"Failed to initialize OpenAI: {e}")
    
    try:
        if settings.claude_api_key:
            AIServiceFactory.register_service(AIProvider.CLAUDE, ClaudeClient())
    except Exception as e:
        print(f"Failed to initialize Claude: {e}")
    
    try:
        if settings.gemini_api_key:
            AIServiceFactory.register_service(AIProvider.GEMINI, GeminiClient())
    except Exception as e:
        print(f"Failed to initialize Gemini: {e}")

# Initialize services on module load
initialize_ai_services()


def determine_ai_provider(requested_model: Optional[AIProvider] = None) -> AIProvider:
    """
    Determine which AI provider to use based on configuration and request.

    Priority:
    1. AI_MODEL_OVERRIDE env variable (if set, always uses this)
    2. requested_model parameter (from API request)
    3. Default provider from available services

    Args:
        requested_model: Model requested via API parameter

    Returns:
        AIProvider: The AI provider to use

    Raises:
        HTTPException: If no AI services are available or selected provider is not available
    """
    available_providers = AIServiceFactory.get_available_providers()

    if not available_providers:
        raise HTTPException(
            status_code=503,
            detail="No AI services available. Please check configuration."
        )

    # Use requested model if provided and available
    if requested_model and requested_model in available_providers:
        print(f"[CONFIG] Using requested model: {requested_model.value}")
        return requested_model

    # Try to use configured default
    try:
        default_provider = AIProvider(settings.ai_provider)
        if default_provider in available_providers:
            print(f"[CONFIG] Using default AI provider: {default_provider.value}")
            return default_provider
    except ValueError:
        pass

    # Fallback to first available
    fallback = available_providers[0]
    print(f"[CONFIG] Using fallback provider: {fallback.value}")
    return fallback


@router.post("/analyze")
async def analyze_artwork(
    image: UploadFile = File(...),
    tone: ToneType = Form(ToneType.GENERAL),
    model: Optional[AIProvider] = Form(None)
):
    """
    Analyze uploaded artwork image using AI with streaming response

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **tone**: Analysis tone (professional, general, sarcastic, educational, poetic)
    - **model**: Preferred AI model (openai, claude, gemini) - optional

    Returns a streaming response with artwork analysis
    """

    # Determine which AI service to use (with override support)
    ai_provider = determine_ai_provider(model)

    try:
        # Process the image (stateless - no file saving)
        image_bytes, _ = await process_image(image)

        # Get AI service
        ai_service = AIServiceFactory.get_service(ai_provider)

        # Create streaming generator
        async def generate():
            try:
                async for chunk in ai_service.analyze_artwork(image_bytes, tone):
                    # Send as Server-Sent Events format
                    yield f"data: {json.dumps({'content': chunk})}\n\n"
            except Exception as e:
                error_msg = f"Error during streaming: {str(e)}"
                yield f"data: {json.dumps({'error': error_msg})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze-artist")
async def analyze_artist(
    image: UploadFile = File(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default")
):
    """
    Analyze uploaded artwork image to identify artist (non-streaming response)

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **model**: Preferred AI model (openai, claude, gemini) - optional
    - **identity**: AI identity/persona (museum_narrator, art_historian) - optional

    Returns complete artist identification details
    """

    # Determine which AI service to use (with override support)
    ai_provider = determine_ai_provider(model)

    try:
        # Process the image (stateless - no file saving)
        image_bytes, _ = await process_image(image)
        # Get AI service and analyze
        ai_service = AIServiceFactory.get_service(ai_provider)
        analysis_text = await ai_service.identify_artist(image_bytes, identity=identity)

        return {
            "analysis": analysis_text,
            "model_used": ai_provider.value
        }

    except Exception as e:
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/analyze-bite")
async def analyze_bite(
    image: UploadFile = File(...),
    artist_name: str = Form(...),
    artwork_name: str = Form("Unknown"),
    topic: Optional[str] = Form(None),
    saved_artwork_id: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    db: Session = Depends(get_db)
):
    """
    Get a concise, interesting bite of information about the artwork

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **artist_name**: Name of the artist
    - **artwork_name**: Name of the artwork (optional, defaults to "Unknown")
    - **topic**: Optional topic to focus on (e.g., "technique", "historical context", "symbolism")
    - **saved_artwork_id**: Optional saved artwork ID for context-aware responses from saved artworks
    - **model**: Preferred AI model (openai, claude, gemini) - optional
    - **identity**: AI identity/persona (museum_narrator, art_historian) - optional

    Returns a short, fascinating fact about the artwork (max 50 words) and saved_artwork_id if applicable
    """

    # Determine which AI service to use (with override support)
    ai_provider = determine_ai_provider(model)

    try:
        # Process the image (stateless - no file saving)
        image_bytes, _ = await process_image(image)

        # Get conversation history from database if saved_artwork_id provided
        previous_messages = []
        db_artwork = None

        if saved_artwork_id:
            # Load saved artwork and its conversation history
            db_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == saved_artwork_id).first()

            if db_artwork:
                print(f"[DEBUG] Found saved artwork: {db_artwork.id}")
                # Get conversation history from Conversation table
                conversations = db.query(Conversation).filter(
                    Conversation.saved_artwork_id == db_artwork.id
                ).order_by(Conversation.sequence_number).all()

                # Convert to message format expected by AI service
                from app.utils.conversation_storage import ConversationMessage
                previous_messages = [
                    ConversationMessage(role=conv.role, content=conv.content)
                    for conv in conversations
                ]
                print(f"[DEBUG] Loaded {len(previous_messages)} previous messages from database")
            else:
                print(f"[WARNING] saved_artwork_id {saved_artwork_id} not found in database")

        followup_question = topic if topic else "Tell me one more thing about this artwork."

        # Get AI service and analyze with conversation history
        ai_service = AIServiceFactory.get_service(ai_provider)
        bite_text = await ai_service.get_artwork_bite(
            image_bytes,
            artist_name,
            artwork_name,
            followup_question,
            previous_messages,
            identity=identity
        )

        # Update the database if this is a saved artwork
        if db_artwork:
            try:
                print(f"[DEBUG] Updating saved artwork conversation in database: {db_artwork.id}")

                # Get the next sequence number
                max_seq = db.query(Conversation.sequence_number).filter(
                    Conversation.saved_artwork_id == db_artwork.id
                ).order_by(Conversation.sequence_number.desc()).first()

                next_seq = (max_seq[0] + 1) if max_seq else 0

                # Add user message
                user_conversation = Conversation(
                    saved_artwork_id=db_artwork.id,
                    sequence_number=next_seq,
                    role="user",
                    content=followup_question,
                    message_metadata={"topic": topic} if topic else None
                )
                db.add(user_conversation)

                # Add assistant message
                assistant_conversation = Conversation(
                    saved_artwork_id=db_artwork.id,
                    sequence_number=next_seq + 1,
                    role="assistant",
                    content=bite_text
                )
                db.add(assistant_conversation)

                db.commit()
                print(f"[DEBUG] Successfully added 2 conversations to database (seq: {next_seq}, {next_seq + 1})")
            except Exception as db_error:
                print(f"[ERROR] Failed to update database: {str(db_error)}")
                db.rollback()
                raise HTTPException(status_code=500, detail=f"Failed to save conversation: {str(db_error)}")

        return {
            "bite": bite_text,
            "artist_name": artist_name,
            "artwork_name": artwork_name,
            "topic": topic,
            "saved_artwork_id": saved_artwork_id,
            "model_used": ai_provider.value
        }

    except Exception as e:
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/analyze-topic")
async def suggest_topic(
    saved_artwork_id: str,
    model: Optional[AIProvider] = None,
    identity: Optional[str] = "default",
    db: Session = Depends(get_db)
):
    """
    Suggest next topic to explore based on conversation history

    - **saved_artwork_id**: ID of the saved artwork to analyze
    - **model**: Preferred AI model (openai, claude, gemini) - optional
    - **identity**: AI identity/persona (museum_narrator, art_historian) - optional

    Returns suggested topics like "background", "technique", "color choices", etc.
    """

    # Determine which AI service to use (with override support)
    ai_provider = determine_ai_provider(model)

    try:
        # Load saved artwork and its conversation history from database
        db_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == saved_artwork_id).first()

        if not db_artwork:
            # Artwork not found, return default topics
            print(f"[DEBUG] Saved artwork {saved_artwork_id} not found in database")
            return {
                "suggested_topics": [
                    "background",
                    "technique",
                    "historical context",
                    "symbolism"
                ],
                "saved_artwork_id": saved_artwork_id
            }

        print(f"[DEBUG] Found artwork in database: {db_artwork.artist_name} - {db_artwork.artwork_name}")

        # Get conversation history from Conversation table
        conversations = db.query(Conversation).filter(
            Conversation.saved_artwork_id == db_artwork.id
        ).order_by(Conversation.sequence_number).all()

        # Extract previous insights from assistant messages
        previous_insights = [
            conv.content
            for conv in conversations
            if conv.role == "assistant"
        ]

        # If no previous insights, return default topics
        if not previous_insights:
            return {
                "suggested_topics": [
                    "background",
                    "technique",
                    "historical context",
                    "symbolism"
                ],
                "saved_artwork_id": saved_artwork_id
            }

        # Get AI service and call suggest_topics method
        ai_service = AIServiceFactory.get_service(ai_provider)
        suggested_topics = await ai_service.suggest_topics(
            db_artwork.artist_name,
            db_artwork.artwork_name,
            previous_insights,
            identity=identity
        )

        return {
            "suggested_topics": suggested_topics,
            "saved_artwork_id": saved_artwork_id,
            "model_used": ai_provider.value
        }

    except json.JSONDecodeError as e:
        print(f"[ERROR] Failed to parse topics JSON")
        # Fallback to default topics
        return {
            "suggested_topics": [
                "background",
                "technique",
                "historical context"
            ],
            "saved_artwork_id": saved_artwork_id,
            "error": "Failed to generate custom topics, using defaults"
        }
    except Exception as e:
        print(f"[ERROR] Topic suggestion failed: {str(e)}")
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Topic suggestion failed: {str(e)}")


@router.get("/providers")
async def get_available_providers():
    """Get list of available AI providers"""

    providers = AIServiceFactory.get_available_providers()
    return {
        "available_providers": [provider.value for provider in providers],
        "default_provider": settings.ai_provider,
        "total": len(providers)
    }


@router.get("/identities")
async def get_available_identities():
    """Get list of available AI identities/personas"""
    from app.utils.prompt_loader import get_available_identities, get_available_instructions

    identities = get_available_identities()
    instructions = get_available_instructions()

    return {
        "available_identities": identities,
        "available_instructions": instructions,
        "default_identities": {
            "artist_identification": "museum_narrator",
            "artwork_bite": "art_historian",
            "suggest_topics": "art_historian"
        }
    }


@router.post("/remove-background")
async def remove_background(
    image: UploadFile = File(...)
):
    """
    Remove background from an image using PhotoRoom API

    - **image**: Image file to process (JPG, PNG, WebP)

    Returns the image with transparent background as PNG
    """

    try:
        # Read image data
        image_data = await image.read()

        # Call PhotoRoom service to remove background
        result_image = await photoroom_service.remove_background(image_data)

        if not result_image:
            raise HTTPException(
                status_code=500,
                detail="Failed to remove background. Please check PhotoRoom API key configuration."
            )

        # Return the processed image
        return Response(
            content=result_image,
            media_type="image/png",
            headers={
                "Content-Disposition": "attachment; filename=no-background.png"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Background removal failed: {str(e)}"
        )


@router.post("/saved-artworks")
async def save_artwork(
    photo_uri: str = Form(...),
    artist_name: str = Form(...),
    artwork_name: str = Form(...),
    conversation_history: str = Form(...),  # JSON string
    user_id: Optional[str] = Form(None),
    device_id: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    museum_name: Optional[str] = Form(None),
    conversation_id: Optional[str] = Form(None),
    is_recognized: bool = Form(True),
    db: Session = Depends(get_db)
):
    """
    Save artwork with complete conversation history

    - **photo_uri**: URI/path to the photo
    - **artist_name**: Name of the artist
    - **artwork_name**: Name of the artwork
    - **conversation_history**: JSON string of complete conversation history
    - **user_id**: User ID (foreign key to users table) - recommended
    - **device_id**: Persistent device identifier from Keychain UUID (optional, legacy)
    - **location**: Geographic location where photo was taken (optional)
    - **museum_name**: Museum or gallery name (optional)
    - **conversation_id**: Optional conversation ID reference (deprecated, kept for compatibility)
    - **is_recognized**: Whether the artwork was recognized (default: True)

    Returns the saved artwork entry
    """
    try:
        # Parse conversation history JSON
        conversation_data = json.loads(conversation_history)

        # Create SavedArtwork (without conversation_history and conversation_id)
        saved_artwork = SavedArtwork(
            photo_uri=photo_uri,
            artist_name=artist_name,
            artwork_name=artwork_name,
            user_id=user_id,
            device_id=device_id,
            location=location,
            museum_name=museum_name,
            is_recognized=1 if is_recognized else 0
        )

        db.add(saved_artwork)
        db.flush()  # Get the artwork ID without committing

        # Create Conversation records from conversation_history
        for idx, message in enumerate(conversation_data):
            role = message.get('role', 'assistant')
            content = message.get('content', '')

            if not content:
                continue

            # Extract optional metadata
            metadata = {}
            if 'topic' in message:
                metadata['topic'] = message['topic']

            conversation = Conversation(
                saved_artwork_id=saved_artwork.id,
                sequence_number=idx,
                role=role,
                content=content,
                message_metadata=metadata if metadata else None
            )
            db.add(conversation)

        db.commit()
        db.refresh(saved_artwork)

        return saved_artwork.to_dict()

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid conversation history JSON: {str(e)}"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save artwork: {str(e)}"
        )


@router.get("/saved-artworks")
async def get_saved_artworks(
    user_id: Optional[str] = None,
    device_id: Optional[str] = None,
    recognized_only: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Get saved artworks with optional filtering

    - **user_id**: Filter by user ID (recommended)
    - **device_id**: Filter by device ID (legacy, optional)
    - **recognized_only**: Filter by recognition status (True/False/None for all)
    - **limit**: Maximum number of entries to return (default: 50)
    - **offset**: Number of entries to skip (default: 0)

    Returns list of saved artworks sorted by most recent first
    """
    try:
        query = db.query(SavedArtwork)

        # Filter by user_id if specified (preferred)
        if user_id is not None:
            query = query.filter(SavedArtwork.user_id == user_id)
        # Fall back to device_id for backwards compatibility
        elif device_id is not None:
            query = query.filter(SavedArtwork.device_id == device_id)

        # Filter by recognition status if specified
        if recognized_only is not None:
            query = query.filter(SavedArtwork.is_recognized == (1 if recognized_only else 0))

        # Order by most recent first and apply pagination
        saved_artworks = query.order_by(SavedArtwork.created_at.desc()).offset(offset).limit(limit).all()

        return {
            "items": [artwork.to_dict() for artwork in saved_artworks],
            "count": len(saved_artworks),
            "offset": offset,
            "limit": limit
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve saved artworks: {str(e)}"
        )


@router.get("/saved-artworks/{artwork_id}")
async def get_saved_artwork(
    artwork_id: str,
    db: Session = Depends(get_db)
):
    """
    Get a specific saved artwork with full conversation history

    - **artwork_id**: ID of the saved artwork

    Returns the saved artwork with complete conversation history
    """
    try:
        saved_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

        if not saved_artwork:
            raise HTTPException(status_code=404, detail="Saved artwork not found")

        return saved_artwork.to_dict()

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve saved artwork: {str(e)}"
        )


@router.put("/saved-artworks/{artwork_id}")
async def update_saved_artwork(
    artwork_id: str,
    request: UpdateArtworkRequest,
    db: Session = Depends(get_db)
):
    """
    Update saved artwork details (artist name, artwork name, and/or background color)

    - **artwork_id**: ID of the saved artwork to update
    - **request**: JSON body with optional artist_name, artwork_name, and background_color

    This will also update the is_recognized field based on the new values:
    - If artist_name is not "Unknown Artist" and artwork_name is not "Unknown", is_recognized is True
    - Otherwise, is_recognized is False

    Returns the updated artwork entry
    """
    try:
        saved_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

        if not saved_artwork:
            raise HTTPException(status_code=404, detail="Saved artwork not found")

        # Update fields if provided
        if request.artist_name is not None:
            saved_artwork.artist_name = request.artist_name.strip()

        if request.artwork_name is not None:
            saved_artwork.artwork_name = request.artwork_name.strip()

        if request.background_color is not None:
            saved_artwork.background_color = request.background_color

        # Recalculate is_recognized based on current values
        # Consider artwork as recognized if both artist and artwork names are meaningful
        is_recognized = (
            saved_artwork.artist_name.lower() != "unknown artist" and
            saved_artwork.artwork_name.lower() != "unknown"
        )
        saved_artwork.is_recognized = 1 if is_recognized else 0

        db.commit()
        db.refresh(saved_artwork)

        return saved_artwork.to_dict()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update saved artwork: {str(e)}"
        )


@router.delete("/saved-artworks/{artwork_id}")
async def delete_saved_artwork(
    artwork_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a saved artwork

    - **artwork_id**: ID of the saved artwork to delete

    Returns success message
    """
    try:
        saved_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == artwork_id).first()

        if not saved_artwork:
            raise HTTPException(status_code=404, detail="Saved artwork not found")

        db.delete(saved_artwork)
        db.commit()

        return {"message": "Saved artwork deleted successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete saved artwork: {str(e)}"
        )


@router.post("/artwork-summary")
async def generate_artwork_summary(
    image: UploadFile = File(...),
    saved_artwork_id: str = Form(...),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default"),
    db: Session = Depends(get_db)
):
    """
    Generate a fun, one-sentence summary of the artwork based on the image and conversation history

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **saved_artwork_id**: ID of the saved artwork
    - **model**: Preferred AI model (openai, claude, gemini) - optional
    - **identity**: AI identity/persona (museum_narrator, art_historian) - optional

    Returns the generated summary and updates the database
    """

    # Determine which AI service to use
    ai_provider = determine_ai_provider(model)

    try:
        # Process the image
        image_bytes, _ = await process_image(image)

        # Load saved artwork from database
        db_artwork = db.query(SavedArtwork).filter(SavedArtwork.id == saved_artwork_id).first()

        if not db_artwork:
            raise HTTPException(status_code=404, detail="Saved artwork not found")

        # Get conversation history from Conversation table
        conversations = db.query(Conversation).filter(
            Conversation.saved_artwork_id == db_artwork.id
        ).order_by(Conversation.sequence_number).all()

        # Convert to message format expected by AI service
        conversation_history = [
            ConversationMessage(role=conv.role, content=conv.content)
            for conv in conversations
        ]

        # Get AI service and generate summary (even if no conversation history)
        ai_service = AIServiceFactory.get_service(ai_provider)
        summary = await ai_service.generate_summary(
            image_bytes,
            db_artwork.artist_name,
            db_artwork.artwork_name,
            conversation_history,
            identity=identity
        )

        # Update the database with the summary
        db_artwork.summary = summary
        db.commit()
        db.refresh(db_artwork)

        return {
            "summary": summary,
            "saved_artwork_id": saved_artwork_id,
            "model_used": ai_provider.value
        }

    except Exception as e:
        db.rollback()
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")