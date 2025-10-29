from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import os
import json

from app.database.connection import get_db
from app.database.models import ArtworkAnalysis
from app.models.artwork import (
    ToneType, AIProvider, ArtworkAnalysisResponse, ImageMetadata
)
from app.services.ai_service import AIServiceFactory
from app.services.openai_client import OpenAIClient
from app.services.claude_client import ClaudeClient
from app.services.gemini_client import GeminiClient
from app.utils.image_processing import process_image
from app.utils.conversation_storage import conversation_storage
from app.config.settings import settings

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


@router.get("/analysis/{analysis_id}", response_model=ArtworkAnalysisResponse)
async def get_analysis(analysis_id: str, db: Session = Depends(get_db)):
    """Get specific artwork analysis by ID"""
    
    analysis = db.query(ArtworkAnalysis).filter(ArtworkAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    image_metadata = ImageMetadata(
        filename=analysis.image_metadata["filename"],
        size=analysis.image_metadata["size"],
        dimensions=tuple(analysis.image_metadata["dimensions"]),
        format=analysis.image_metadata["format"],
        upload_timestamp=analysis.created_at
    )
    
    return ArtworkAnalysisResponse(
        id=analysis.id,
        analysis=analysis.analysis_text,
        metadata=image_metadata,
        tone=ToneType(analysis.tone),
        model_used=AIProvider(analysis.ai_model),
        timestamp=analysis.created_at
    )


@router.delete("/analysis/{analysis_id}")
async def delete_analysis(analysis_id: str, db: Session = Depends(get_db)):
    """Delete artwork analysis and associated image"""
    
    analysis = db.query(ArtworkAnalysis).filter(ArtworkAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Delete image file
    if os.path.exists(analysis.image_path):
        try:
            os.remove(analysis.image_path)
        except OSError:
            pass  # File might already be deleted
    
    # Delete database record
    db.delete(analysis)
    db.commit()
    
    return {"message": "Analysis deleted successfully"}


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
    conversation_id: Optional[str] = Form(None),
    model: Optional[AIProvider] = Form(None),
    identity: Optional[str] = Form("default")
):
    """
    Get a concise, interesting bite of information about the artwork

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **artist_name**: Name of the artist
    - **artwork_name**: Name of the artwork (optional, defaults to "Unknown")
    - **topic**: Optional topic to focus on (e.g., "technique", "historical context", "symbolism")
    - **conversation_id**: Optional conversation ID for context-aware responses
    - **model**: Preferred AI model (openai, claude, gemini) - optional
    - **identity**: AI identity/persona (museum_narrator, art_historian) - optional

    Returns a short, fascinating fact about the artwork (max 50 words) and conversation_id
    """

    # Determine which AI service to use (with override support)
    ai_provider = determine_ai_provider(model)

    try:
        # Process the image (stateless - no file saving)
        image_bytes, _ = await process_image(image)

        # Get or create conversation
        if not conversation_id:
            # Create new conversation
            conversation_id = conversation_storage.create_conversation(artist_name, artwork_name)
        else:
            # Verify conversation exists
            conversation = conversation_storage.get_conversation(conversation_id)
            if not conversation:
                conversation_id = conversation_storage.create_conversation(artist_name, artwork_name)

        # Get conversation history
        previous_messages = conversation_storage.get_messages(conversation_id)
        print(f"[DEBUG] Conversation {conversation_id} has {len(previous_messages)} previous messages")

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

        # Store the new bite in conversation history
        conversation_storage.add_message(conversation_id, "user", followup_question)
        conversation_storage.add_message(conversation_id, "assistant", bite_text)

        return {
            "bite": bite_text,
            "artist_name": artist_name,
            "artwork_name": artwork_name,
            "topic": topic,
            "conversation_id": conversation_id,
            "model_used": ai_provider.value
        }

    except Exception as e:
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/analyze-topic")
async def suggest_topic(
    conversation_id: str,
    model: Optional[AIProvider] = None,
    identity: Optional[str] = "default"
):
    """
    Suggest next topic to explore based on conversation history

    - **conversation_id**: ID of the conversation to analyze
    - **model**: Preferred AI model (openai, claude, gemini) - optional
    - **identity**: AI identity/persona (museum_narrator, art_historian) - optional

    Returns suggested topics like "background", "technique", "color choices", etc.
    """

    # Determine which AI service to use (with override support)
    ai_provider = determine_ai_provider(model)

    try:
        # Get conversation history
        conversation = conversation_storage.get_conversation(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail=f"Conversation {conversation_id} not found")

        previous_messages = conversation_storage.get_messages(conversation_id)
        if not previous_messages:
            # No history, return default topics
            return {
                "suggested_topics": [
                    "background",
                    "technique",
                    "historical context",
                    "symbolism"
                ],
                "conversation_id": conversation_id
            }

        # Extract previous insights (assistant messages only)
        previous_insights = [msg.content for msg in previous_messages if msg.role == "assistant"]

        # Get AI service and call suggest_topics method
        ai_service = AIServiceFactory.get_service(ai_provider)
        suggested_topics = await ai_service.suggest_topics(
            conversation.artist_name,
            conversation.artwork_name,
            previous_insights,
            identity=identity
        )

        return {
            "suggested_topics": suggested_topics,
            "conversation_id": conversation_id,
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
            "conversation_id": conversation_id,
            "error": "Failed to generate custom topics, using defaults"
        }
    except Exception as e:
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