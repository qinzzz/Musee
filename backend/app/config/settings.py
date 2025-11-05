from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # AI Service Configuration
    ai_provider: str = "openai"
    ai_model_override: Optional[str] = None  # Override model version (e.g., "gpt-4o-mini", "claude-opus-4", "gemini-1.5-pro")
    openai_api_key: Optional[str] = None
    claude_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # Database
    use_database: bool = True
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./musee.db")

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True

    # File Upload
    max_file_size_mb: int = 10

    # Security
    secret_key: str = "your-secret-key-change-this-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # PhotoRoom API
    photoroom_api_key: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()


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
        print(f"[CONFIG] Using AI_MODEL_OVERRIDE: {settings.ai_model_override}")
        return settings.ai_model_override.lower()

    # Use requested model if provided
    if requested_model:
        print(f"[CONFIG] Using requested model: {requested_model}")
        return requested_model.lower()

    # Fall back to default provider
    print(f"[CONFIG] Using default AI provider: {settings.ai_provider}")
    return settings.ai_provider.lower()