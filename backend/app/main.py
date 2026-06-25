from contextlib import asynccontextmanager
import logging
import os
import re
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.config.settings import settings
from app.database.bootstrap import initialize_database
from app.middleware.request_timing import add_request_timing_middleware
from app.routers import admin_maintenance, artwork_identify, artwork_ingest, artwork_library, artwork_metadata, artwork_mutations, artwork_utilities, auth, collection, tag, taste_profile, users, visit_chat
from app.routers import sessions as sessions_router


def configure_logging() -> logging.Logger:
    log_level = logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )
    logging.getLogger("uvicorn.access").setLevel(log_level)
    logging.getLogger("uvicorn.error").setLevel(log_level)
    logging.getLogger("python_multipart.multipart").setLevel(logging.WARNING)
    logging.getLogger("PIL.TiffImagePlugin").setLevel(logging.WARNING)
    logging.getLogger("openai._base_client").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    return logging.getLogger(__name__)


logger = configure_logging()


def log_runtime_configuration() -> None:
    if settings.ai_provider:
        logger.info("AI_PROVIDER is set to: %s", settings.ai_provider)
    else:
        logger.info("AI_PROVIDER is not set (using default provider)")

    if settings.ai_model_override:
        logger.info("AI_MODEL_OVERRIDE is set to: %s", settings.ai_model_override)
    else:
        logger.info("AI_MODEL_OVERRIDE is not set (using default models)")

    if settings.openai_reasoning_effort:
        logger.info("OPENAI_REASONING_EFFORT is set to: %s", settings.openai_reasoning_effort)
    if settings.openai_verbosity:
        logger.info("OPENAI_VERBOSITY is set to: %s", settings.openai_verbosity)

    logger.info("%s", "=" * 50)
    logger.info("ENVIRONMENT: %s", settings.env.upper())
    if settings.use_database:
        masked_url = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", settings.effective_database_url)
        logger.info("DATABASE: %s", masked_url)
    logger.info("STORAGE: %s", settings.storage_type)
    logger.info(
        "Token: Vercel Blob read-write token configured"
        if settings.blob_read_write_token
        else "Token not found. Using local filesystem"
    )
    logger.info("%s", "=" * 50)


def create_lifespan():
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.use_database:
            from app.database.connection import Base, engine

            initialize_database(engine, Base)
        yield

    return lifespan


def configure_cors(app: FastAPI) -> None:
    allowed_origins = [
        "https://musee-web.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
    ]
    allowed_origin_regex = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?$"
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=allowed_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


def register_routers(app: FastAPI) -> None:
    app.include_router(artwork_identify.router, prefix="/api", tags=["artwork-identify"])
    app.include_router(artwork_utilities.router, prefix="/api", tags=["artwork-utilities"])
    app.include_router(artwork_mutations.router, prefix="/api", tags=["artwork-mutations"])
    app.include_router(artwork_metadata.router, prefix="/api", tags=["artwork-metadata"])
    app.include_router(admin_maintenance.router, prefix="/api", tags=["admin-maintenance"])
    app.include_router(artwork_ingest.router, prefix="/api", tags=["artwork-ingest"])
    app.include_router(artwork_library.router, prefix="/api", tags=["artwork-library"])
    app.include_router(taste_profile.router, prefix="/api", tags=["taste-profile"])
    app.include_router(visit_chat.router, prefix="/api", tags=["visit-chat"])
    app.include_router(users.router, prefix="/api", tags=["users"])
    app.include_router(collection.router, prefix="/api", tags=["collection"])
    app.include_router(tag.router, prefix="/api", tags=["tag"])
    app.include_router(auth.router, prefix="/api", tags=["auth"])
    app.include_router(sessions_router.router, prefix="/api", tags=["sessions"])


def mount_uploads_dir(app: FastAPI) -> None:
    if settings.env.lower() == "prod":
        logger.info("Skipping uploads directory initialization in production environment (read-only filesystem)")
        return

    uploads_path = os.path.join(os.getcwd(), settings.uploads_dir)
    os.makedirs(uploads_path, exist_ok=True)
    app.mount(f"/{settings.uploads_dir}", StaticFiles(directory=uploads_path), name="uploads")
    logger.info("Mounted uploads directory: %s", uploads_path)


def create_app() -> FastAPI:
    log_runtime_configuration()
    app = FastAPI(
        title="Musee API",
        description="Stateless backend API for Musee artwork analysis application",
        version="1.0.0",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=create_lifespan(),
    )

    configure_cors(app)
    add_request_timing_middleware(app)
    register_routers(app)
    mount_uploads_dir(app)

    @app.get("/")
    async def root():
        return {
            "message": "Welcome to Musee API",
            "version": "1.0.0",
            "docs": "/docs" if settings.debug else "Documentation disabled in production",
        }

    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "ai_provider": settings.ai_provider,
            "database_enabled": settings.use_database,
        }

    return app


app = create_app()


if __name__ == "__main__":
    logger.info("Starting Musee API server on %s:%s", settings.host, settings.port)
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_config=None,
    )
