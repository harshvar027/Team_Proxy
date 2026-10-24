"""
Baari — app/config.py
Application settings loaded from .env via pydantic-settings.
"""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Database
    database_url: str = Field(default="sqlite:///./baari.db")

    # Session / CSRF secret
    secret_key: str = Field(default="CHANGE-ME-IN-PRODUCTION")

    # Server
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)

    # Queue defaults
    arrival_buffer_minutes: int = Field(default=15)
    reminder_threshold_minutes: int = Field(default=20)

    # Rate limiting
    login_rate_limit: str = Field(default="5/minute")

    # Voice model paths
    whisper_model_size: str = Field(default="small")
    whisper_model_dir: str = Field(default="./models")
    piper_model_dir: str = Field(default="./models")

    # Session
    session_expiry_hours: int = Field(default=8)

    # Lockout
    max_failed_logins: int = Field(default=5)
    lockout_minutes: int = Field(default=10)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


# Singleton — imported everywhere as `from app.config import settings`
settings = Settings()
