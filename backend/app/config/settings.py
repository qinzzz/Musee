from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # AI Service Configuration
    ai_provider: str = "openai"
    openai_api_key: Optional[str] = None
    claude_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # Database
    use_database: bool = True
    database_url: str = "sqlite:///./musee.db"

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

    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()