from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Determine env file path - prefer project root .env.development.local
def _find_env_file() -> str:
    """Find the best env file to use."""
    # When running from backend/, the project root is ../
    possible_paths = [
        Path(".env"),
        Path("../.env.development.local"),  # Project root (preferred)
        Path("../.env.local"),
        Path("../.env"),
    ]

    for path in possible_paths:
        if path.exists():
            logger.info(f"Using env file: {path.resolve()}")
            return str(path)

    logger.warning("No .env file found")
    return ".env"


class Settings(BaseSettings):
    # AI Service Configuration
    ai_provider: str = "openai"
    ai_model_override: Optional[str] = None  # Override model version (e.g., "gpt-4o-mini", "claude-opus-4", "gemini-1.5-pro")
    openai_api_key: Optional[str] = None
    openai_reasoning_effort: Optional[str] = None  # Reasoning effort level (e.g., "low", "medium", "high")
    openai_verbosity: Optional[str] = None  # Verbosity level (e.g., "low", "medium", "high")
    claude_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    google_client_id: Optional[str] = None

    # Environment: "dev" or "prod"
    env: str = "dev"

    # Database - Neon PostgreSQL
    use_database: bool = True
    neon_database_url: Optional[str] = None      # Default (used if env-specific not set)
    neon_database_url_dev: Optional[str] = None  # Dev database
    neon_database_url_prod: Optional[str] = None # Prod database

    @property
    def effective_database_url(self) -> str:
        """Return appropriate database URL based on environment"""
        if self.env == "prod" and self.neon_database_url_prod:
            return self.neon_database_url_prod
        if self.env == "dev" and self.neon_database_url_dev:
            return self.neon_database_url_dev
        if self.neon_database_url:
            return self.neon_database_url
        raise ValueError("No database URL configured. Set NEON_DATABASE_URL or NEON_DATABASE_URL_DEV/PROD")

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    ai_timeout: int = 115  # Seconds before timing out AI calls

    # File Upload & Storage
    max_file_size_mb: int = 10
    uploads_dir: str = "uploads"  # Directory for local storage
    storage_type: str = "local"   # "local" or "vercel_blob"
    blob_read_write_token: Optional[str] = None  # Vercel Blob token

    # Security
    secret_key: str = "your-secret-key-change-this-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # PhotoRoom API
    photoroom_api_key: Optional[str] = None

    model_config = SettingsConfigDict(
        # Load from multiple env files - later ones override earlier ones
        env_file=("../.env", "../.env.local", "../.env.development.local", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore extra fields in env file
    )


# Find and log which env file is being used
_env_file = _find_env_file()

# Global settings instance
settings = Settings(_env_file=_env_file)


def get_ai_provider(requested_model: Optional[str] = None) -> str:
    """
    Determine which AI provider to use based on configuration and request.

    Priority:
    1. AI_MODEL_OVERRIDE env variable (if set, always uses this)
    2. requested_model parameter (from API request)
    3. ai_provider setting (default from .env or code)

    Args:
        requested_model: Model requested via API parameter

    Returns:
        str: The AI provider to use ("openai", "claude", or "gemini")
    """
    # Check if override is set in environment
    if settings.ai_model_override:
        logger.info(f"Using AI_MODEL_OVERRIDE: {settings.ai_model_override}")
        return settings.ai_model_override.lower()

    # Use requested model if provided
    if requested_model:
        logger.info(f"Using requested model: {requested_model}")
        return requested_model.lower()

    # Fall back to default provider
    logger.info(f"Using default AI provider: {settings.ai_provider}")
    return settings.ai_provider.lower()