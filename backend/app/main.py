from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import logging
import sys
import os

from app.config.settings import settings
from app.routers import artwork, users, collection, tag, auth

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.use_database:
        from app.database.connection import engine, Base
        from sqlalchemy import text
        Base.metadata.create_all(bind=engine)
        _is_sqlite = "sqlite" in str(engine.url)
        if not _is_sqlite:
            with engine.connect() as _conn:
                _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_stats JSONB"))
                _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'free'"))
                _conn.execute(text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS reference_urls JSONB"))
                _conn.execute(text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artwork_entity_id VARCHAR"))
                _conn.execute(text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS artist_entity_id VARCHAR"))
                _conn.execute(text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS insights JSONB"))
                _conn.execute(text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification VARCHAR(20) NOT NULL DEFAULT 'unsorted'"))
                _conn.execute(text("ALTER TABLE saved_artworks ADD COLUMN IF NOT EXISTS classification_updated_at TIMESTAMP"))
                _conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS skill_events (
                        id SERIAL PRIMARY KEY,
                        user_id VARCHAR NOT NULL,
                        artwork_id VARCHAR,
                        skill_name VARCHAR NOT NULL,
                        event_type VARCHAR NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                """))
                _conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS taste_profiles (
                        user_id VARCHAR PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
                        status VARCHAR(20) NOT NULL DEFAULT 'not_ready',
                        eligible_count INTEGER NOT NULL DEFAULT 0,
                        required_count INTEGER NOT NULL DEFAULT 5,
                        love_count INTEGER NOT NULL DEFAULT 0,
                        reject_count INTEGER NOT NULL DEFAULT 0,
                        respect_count INTEGER NOT NULL DEFAULT 0,
                        is_outdated INTEGER NOT NULL DEFAULT 0,
                        generated_at TIMESTAMP NULL,
                        outdated_at TIMESTAMP NULL,
                        love_vector JSONB NULL,
                        reject_vector JSONB NULL,
                        taste_vector JSONB NULL,
                        source_artwork_ids JSONB NULL,
                        narrative_summary TEXT NULL,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                """))
                _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_saved_artworks_user_id ON saved_artworks(user_id)"))
                _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_saved_artworks_device_id ON saved_artworks(device_id)"))
                _conn.commit()
        logger.info("Database initialized and migrations applied")
    yield

# Initialize FastAPI app
app = FastAPI(
    title="Musee API",
    description="Stateless backend API for Musee artwork analysis application",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

allowed_origins = [
    "https://musee-web.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5173",
]

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(artwork.router, prefix="/api", tags=["artwork"])
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(collection.router, prefix="/api", tags=["collection"])
app.include_router(tag.router, prefix="/api", tags=["tag"])
app.include_router(auth.router, prefix="/api", tags=["auth"])

# Mount uploads directory for serving stored images (web clients)
# Only if NOT in production, as Vercel has a read-only filesystem
if settings.env.lower() != "prod":
    uploads_path = os.path.join(os.getcwd(), settings.uploads_dir)
    os.makedirs(uploads_path, exist_ok=True)
    app.mount(f"/{settings.uploads_dir}", StaticFiles(directory=uploads_path), name="uploads")
    logger.info(f"Mounted uploads directory: {uploads_path}")
else:
    logger.info("Skipping uploads directory initialization in production environment (read-only filesystem)")


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
