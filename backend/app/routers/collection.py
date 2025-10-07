from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional

from app.database.connection import get_db
from app.database.models import ArtworkAnalysis
from app.models.artwork import (
    CollectionResponse, ArtworkAnalysisResponse, ImageMetadata, 
    ToneType, AIProvider
)

router = APIRouter()


@router.get("/collection", response_model=CollectionResponse)
async def get_collection(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=50, description="Items per page"),
    tone: Optional[ToneType] = Query(None, description="Filter by tone"),
    model: Optional[AIProvider] = Query(None, description="Filter by AI model"),
    db: Session = Depends(get_db)
):
    """
    Get user's artwork analysis collection with pagination and filtering
    
    - **page**: Page number (starts from 1)
    - **per_page**: Number of items per page (max 50)
    - **tone**: Filter by analysis tone
    - **model**: Filter by AI model used
    """
    
    # Build query
    query = db.query(ArtworkAnalysis)
    
    # Apply filters
    if tone:
        query = query.filter(ArtworkAnalysis.tone == tone.value)
    
    if model:
        query = query.filter(ArtworkAnalysis.ai_model == model.value)
    
    # Get total count for pagination
    total = query.count()
    
    # Apply pagination and ordering
    offset = (page - 1) * per_page
    analyses = query.order_by(desc(ArtworkAnalysis.created_at)).offset(offset).limit(per_page).all()
    
    # Convert to response format
    response_analyses = []
    for analysis in analyses:
        image_metadata = ImageMetadata(
            filename=analysis.image_metadata["filename"],
            size=analysis.image_metadata["size"],
            dimensions=tuple(analysis.image_metadata["dimensions"]),
            format=analysis.image_metadata["format"],
            upload_timestamp=analysis.created_at
        )
        
        response_analyses.append(ArtworkAnalysisResponse(
            id=analysis.id,
            analysis=analysis.analysis_text,
            metadata=image_metadata,
            tone=ToneType(analysis.tone),
            model_used=AIProvider(analysis.ai_model),
            timestamp=analysis.created_at
        ))
    
    return CollectionResponse(
        analyses=response_analyses,
        total=total,
        page=page,
        per_page=per_page
    )


@router.get("/collection/stats")
async def get_collection_stats(db: Session = Depends(get_db)):
    """Get statistics about the user's collection"""
    
    total_analyses = db.query(ArtworkAnalysis).count()
    
    # Count by tone
    tone_stats = {}
    for tone in ToneType:
        count = db.query(ArtworkAnalysis).filter(ArtworkAnalysis.tone == tone.value).count()
        tone_stats[tone.value] = count
    
    # Count by AI model
    model_stats = {}
    for model in AIProvider:
        count = db.query(ArtworkAnalysis).filter(ArtworkAnalysis.ai_model == model.value).count()
        model_stats[model.value] = count
    
    # Get most recent analysis
    latest_analysis = db.query(ArtworkAnalysis).order_by(desc(ArtworkAnalysis.created_at)).first()
    
    return {
        "total_analyses": total_analyses,
        "tone_distribution": tone_stats,
        "model_distribution": model_stats,
        "latest_analysis_date": latest_analysis.created_at if latest_analysis else None
    }


@router.get("/collection/search")
async def search_collection(
    query: str = Query(..., min_length=3, description="Search query"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Search through analysis texts in the collection
    
    - **query**: Search term (minimum 3 characters)
    - **page**: Page number
    - **per_page**: Items per page
    """
    
    # Search in analysis text (basic text search)
    search_query = db.query(ArtworkAnalysis).filter(
        ArtworkAnalysis.analysis_text.contains(query)
    )
    
    total = search_query.count()
    
    # Apply pagination
    offset = (page - 1) * per_page
    analyses = search_query.order_by(desc(ArtworkAnalysis.created_at)).offset(offset).limit(per_page).all()
    
    # Convert to response format
    response_analyses = []
    for analysis in analyses:
        image_metadata = ImageMetadata(
            filename=analysis.image_metadata["filename"],
            size=analysis.image_metadata["size"],
            dimensions=tuple(analysis.image_metadata["dimensions"]),
            format=analysis.image_metadata["format"],
            upload_timestamp=analysis.created_at
        )
        
        response_analyses.append(ArtworkAnalysisResponse(
            id=analysis.id,
            analysis=analysis.analysis_text,
            metadata=image_metadata,
            tone=ToneType(analysis.tone),
            model_used=AIProvider(analysis.ai_model),
            timestamp=analysis.created_at
        ))
    
    return {
        "analyses": response_analyses,
        "total": total,
        "page": page,
        "per_page": per_page,
        "query": query
    }