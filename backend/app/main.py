from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import sys

from app.config.settings import settings
from app.routers import artwork, users, collection, tag

# Configure logging to work with uvicorn
# This ensures all Python logs are visible in uvicorn output
# Use INFO level to avoid verbose debug logs from third-party libraries
log_level = logging.INFO
logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ],
    force=True  # Override any existing configuration
)

# Set log level for uvicorn access logs
logging.getLogger("uvicorn.access").setLevel(log_level)
logging.getLogger("uvicorn.error").setLevel(log_level)

# Suppress verbose debug logs from third-party libraries
logging.getLogger("python_multipart.multipart").setLevel(logging.WARNING)
logging.getLogger("PIL.TiffImagePlugin").setLevel(logging.WARNING)
logging.getLogger("openai._base_client").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Get logger for this module
logger = logging.getLogger(__name__)

# Log AI model override configuration at startup
if settings.ai_provider:
    logger.info(f"AI_PROVIDER is set to: {settings.ai_provider}")
else:
    logger.info("AI_PROVIDER is not set (using default provider)")

if settings.ai_model_override:
    logger.info(f"AI_MODEL_OVERRIDE is set to: {settings.ai_model_override}")
else:
    logger.info("AI_MODEL_OVERRIDE is not set (using default models)")

# Log OpenAI reasoning and verbosity configuration at startup
if settings.openai_reasoning_effort:
    logger.info(f"OPENAI_REASONING_EFFORT is set to: {settings.openai_reasoning_effort}")
if settings.openai_verbosity:
    logger.info(f"OPENAI_VERBOSITY is set to: {settings.openai_verbosity}")

# Initialize database only if enabled
if settings.use_database:
    from app.database.connection import engine, Base
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized and tables created")

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
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(collection.router, prefix="/api", tags=["collection"])
app.include_router(tag.router, prefix="/api", tags=["tag"])


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
    logger.info(f"Starting Musee API server on {settings.host}:{settings.port}")
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_config=None  # Use our custom logging configuration
    )