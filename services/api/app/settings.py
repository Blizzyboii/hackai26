from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    api_allowed_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    api_data_dir: str = "./data"
    api_max_duration_sec: int = 180
    edge_worker_url: str = "http://localhost:8010"
    edge_worker_username: str | None = None
    edge_worker_password: str | None = None
    edge_worker_auth_header: str | None = None
    edge_checkpoint_path: str | None = None
    edge_chunk_seconds: int = 24
    edge_overlap_seconds: int = 4

    lyria_project: str | None = None
    lyria_location: str = "us-central1"
    lyria_model: str = "lyria-002"
    lyria_enable_mock: bool = False

    cors_allow_credentials: bool = True

    @property
    def data_dir(self) -> Path:
        return Path(self.api_data_dir).resolve()

    @property
    def assets_dir(self) -> Path:
        return self.data_dir / "assets"

    @property
    def audio_dir(self) -> Path:
        return self.assets_dir / "audio"

    @property
    def thumbs_dir(self) -> Path:
        return self.assets_dir / "thumbnails"

    @property
    def motions_dir(self) -> Path:
        return self.assets_dir / "motions"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.api_allowed_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
