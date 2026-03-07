from functools import lru_cache
from typing import List

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Supabase ──────────────────────────────────────────
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_service_key: str = Field(..., description="Supabase service role key")
    supabase_jwt_secret: str = Field(..., description="Supabase JWT secret")

    # ─── Hugging Face ──────────────────────────────────────
    huggingface_api_key: str = Field(..., description="Hugging Face Inference API key")
    huggingface_model: str = Field(
        default="facebook/bart-large-mnli",
        description="HuggingFace model for zero-shot classification",
    )

    # ─── Sentry ────────────────────────────────────────────
    sentry_dsn: str = Field(default="", description="Sentry DSN (empty = disabled)")

    # ─── CORS ──────────────────────────────────────────────
    allowed_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed CORS origins",
    )

    # ─── File Upload ───────────────────────────────────────
    max_file_size_mb: int = Field(default=10, description="Max upload size in MB", ge=1, le=100)

    # ─── App ───────────────────────────────────────────────
    environment: str = Field(
        default="development",
        description="Runtime environment: development | production",
    )
    app_name: str = Field(default="AuraNode API", description="Application name")
    app_version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Enable debug mode")

    # ─── Storage Buckets ───────────────────────────────────
    uploads_bucket: str = Field(default="diagnostic-uploads", description="Supabase Storage bucket for uploads")
    reports_bucket: str = Field(default="generated-reports", description="Supabase Storage bucket for reports")

    # ─── Computed Fields ───────────────────────────────────
    @computed_field  # type: ignore[prop-decorator]
    @property
    def max_file_size_bytes(self) -> int:
        """Maximum file size in bytes, derived from max_file_size_mb."""
        return self.max_file_size_mb * 1024 * 1024

    @computed_field  # type: ignore[prop-decorator]
    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        """True when running in production environment."""
        return self.environment.lower() == "production"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_development(self) -> bool:
        """True when running in development environment."""
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


# Convenience singleton — import this throughout the app
settings = get_settings()
