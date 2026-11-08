from __future__ import annotations

from pathlib import Path
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    env: str = Field(default="development", alias="JOBPILOT_ENV")
    database_url: str = Field(default=f"sqlite:///{ROOT / 'data' / 'jobpilot.db'}", alias="JOBPILOT_DATABASE_URL")
    secret: str = Field(default="change-me-local-dev", alias="JOBPILOT_SECRET")
    frontend_origin: str = Field(default="http://127.0.0.1:5173", alias="JOBPILOT_FRONTEND_ORIGIN")
    approval_mode: Literal["manual_review", "approve_each_batch", "auto_submit_allowlisted"] = Field(
        default="manual_review", alias="JOBPILOT_APPROVAL_MODE"
    )
    browser_headless: bool = Field(default=False, alias="JOBPILOT_BROWSER_HEADLESS")
    default_provider: str = Field(default="gemini", alias="JOBPILOT_DEFAULT_PROVIDER")

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    groq_api_key: str | None = Field(default=None, alias="GROQ_API_KEY")
    openai_compatible_base_url: str | None = Field(default=None, alias="OPENAI_COMPATIBLE_BASE_URL")
    openai_compatible_api_key: str | None = Field(default=None, alias="OPENAI_COMPATIBLE_API_KEY")

    ai_config_path: Path = ROOT / "backend" / "app" / "core" / "ai_config.yaml"
    data_dir: Path = ROOT / "data"
    browser_profiles_dir: Path = ROOT / "browser_profiles"
    exports_dir: Path = ROOT / "exports"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.browser_profiles_dir.mkdir(parents=True, exist_ok=True)
settings.exports_dir.mkdir(parents=True, exist_ok=True)
