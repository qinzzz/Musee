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

    # Determine which AI service to use
    if model and model in AIServiceFactory.get_available_providers():
        ai_provider = model
    else:
        # Use configured default or first available
        available_providers = AIServiceFactory.get_available_providers()
        if not available_providers:
            raise HTTPException(
                status_code=503,
                detail="No AI services available. Please check configuration."
            )

        # Try to use configured default, fallback to first available
        if AIProvider(settings.ai_provider) in available_providers:
            ai_provider = AIProvider(settings.ai_provider)
        else:
            ai_provider = available_providers[0]

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
    model: Optional[AIProvider] = Form(None)
):
    """
    Analyze uploaded artwork image to identify artist (non-streaming response)

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **model**: Preferred AI model (openai, claude, gemini) - optional

    Returns complete artist identification details
    """

    # Determine which AI service to use
    if model and model in AIServiceFactory.get_available_providers():
        ai_provider = model
    else:
        # Use configured default or first available
        available_providers = AIServiceFactory.get_available_providers()
        if not available_providers:
            raise HTTPException(
                status_code=503,
                detail="No AI services available. Please check configuration."
            )

        # Try to use configured default, fallback to first available
        if AIProvider(settings.ai_provider) in available_providers:
            ai_provider = AIProvider(settings.ai_provider)
        else:
            ai_provider = available_providers[0]

    try:
        # Process the image (stateless - no file saving)
        image_bytes, _ = await process_image(image)
        print(f"[DEBUG] Image processed: {len(image_bytes)} bytes")

        # Get AI service and analyze
        ai_service = AIServiceFactory.get_service(ai_provider)
        print(f"[DEBUG] Using AI provider: {ai_provider.value}")

        analysis_text = await ai_service.identify_artist(image_bytes)
        print(f"[DEBUG] Analysis text received: {analysis_text[:200] if analysis_text else 'EMPTY'}")

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
    model: Optional[AIProvider] = Form(None)
):
    """
    Get a concise, interesting bite of information about the artwork

    - **image**: Image file to analyze (JPG, PNG, WebP)
    - **artist_name**: Name of the artist
    - **artwork_name**: Name of the artwork (optional, defaults to "Unknown")
    - **model**: Preferred AI model (openai, claude, gemini) - optional

    Returns a short, fascinating fact about the artwork (max 50 words)
    """

    # Determine which AI service to use
    if model and model in AIServiceFactory.get_available_providers():
        ai_provider = model
    else:
        # Use configured default or first available
        available_providers = AIServiceFactory.get_available_providers()
        if not available_providers:
            raise HTTPException(
                status_code=503,
                detail="No AI services available. Please check configuration."
            )

        # Try to use configured default, fallback to first available
        if AIProvider(settings.ai_provider) in available_providers:
            ai_provider = AIProvider(settings.ai_provider)
        else:
            ai_provider = available_providers[0]

    try:
        # Process the image (stateless - no file saving)
        image_bytes, _ = await process_image(image)

        # Get AI service and analyze
        ai_service = AIServiceFactory.get_service(ai_provider)
        bite_text = await ai_service.get_artwork_bite(image_bytes, artist_name, artwork_name)

        return {
            "bite": bite_text,
            "artist_name": artist_name,
            "artwork_name": artwork_name,
            "model_used": ai_provider.value
        }

    except Exception as e:
        if "API error" in str(e):
            raise HTTPException(status_code=503, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/providers")
async def get_available_providers():
    """Get list of available AI providers"""

    providers = AIServiceFactory.get_available_providers()
    return {
        "available_providers": [provider.value for provider in providers],
        "default_provider": settings.ai_provider,
        "total": len(providers)
    }