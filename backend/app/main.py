from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import logging
import sys
import os

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

# Log environment and database configuration
logger.info(f"=" * 50)
logger.info(f"ENVIRONMENT: {settings.env.upper()}")
if settings.use_database:
    db_url = settings.effective_database_url
    # Mask password in URL for logging
    import re
    masked_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', db_url)
    logger.info(f"DATABASE: {masked_url}")
logger.info(f"STORAGE: {settings.storage_type}")
logger.info("Token: Vercel Blob read-write token configured" if settings.blob_read_write_token else "Token not found. Using local filesystem")
logger.info(f"=" * 50)

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

# Configure CORS
origins = [
    "https://musee-web.vercel.app",
    "https://musee.qinzzz.com",
    "http://localhost:5173",
    "http://localhost:3000",
    "*", # Keep wildcard but usually overridden by specific origins if credentials=True
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(artwork.router, prefix="/api", tags=["artwork"])
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(collection.router, prefix="/api", tags=["collection"])
app.include_router(tag.router, prefix="/api", tags=["tag"])

# Mount uploads directory for serving stored images (web clients)
uploads_path = os.path.join(os.getcwd(), settings.uploads_dir)
os.makedirs(uploads_path, exist_ok=True)
app.mount(f"/{settings.uploads_dir}", StaticFiles(directory=uploads_path), name="uploads")
logger.info(f"Mounted uploads directory: {uploads_path}")


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