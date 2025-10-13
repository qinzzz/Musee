from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config.settings import settings
from app.routers import artwork

# Initialize database only if enabled
if settings.use_database:
    from app.routers import collection
    from app.database.connection import engine, Base
    # Create database tables
    Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="Musee API",
    description="Stateless backend API for Musee artwork analysis application",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)

# Configure CORS for React Native
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(artwork.router, prefix="/api", tags=["artwork"])

# Only include collection router if database is enabled
if settings.use_database:
    app.include_router(collection.router, prefix="/api", tags=["collection"])


@app.get("/")
async def root():
    return {
        "message": "Welcome to Musee API",
        "version": "1.0.0",
        "docs": "/docs" if settings.debug else "Documentation disabled in production"
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "ai_provider": settings.ai_provider,
        "database_enabled": settings.use_database
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )