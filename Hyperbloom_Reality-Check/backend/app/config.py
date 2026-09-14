"""Runtime configuration. Everything overridable by environment variable."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_prefix="", extra="ignore"
    )

    # ---- OpenRouter -------------------------------------------------------
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    app_url: str = "http://localhost:3000"
    app_title: str = "Reality Check"

    # Model roles. Free-tier defaults chosen because they support strict
    # json_schema structured outputs, which the whole pipeline depends on.
    # Benchmarked on this pipeline's own source-criticism task: the mini
    # returned identical stance classifications to the pro in 5.0s against
    # 40.3s, because the pro spends most of its budget on reasoning tokens.
    # For an interactive demo that difference decides the product.
    model_reasoning: str = "nex-agi/nex-n2.5-mini:free"
    model_fast: str = "nex-agi/nex-n2.5-mini:free"
    model_vision: str = "nex-agi/nex-n2.5-mini:free"
    # Tried in order when the primary role model errors or rate-limits.
    model_fallbacks: str = "dots-studio/dots-3-note-preview:free,nex-agi/nex-n2.5-pro:free"

    llm_timeout_s: float = 120.0
    llm_max_retries: int = 3
    llm_temperature: float = 0.15

    # ---- Retrieval --------------------------------------------------------
    # Contact address sent to the polite pools of OpenAlex / Crossref / NCBI.
    # These APIs need no key; they ask only that you identify yourself.
    retrieval_contact_email: str = "reality-check@example.com"
    retrieval_timeout_s: float = 20.0
    max_sources_per_claim: int = 14
    max_queries_per_claim: int = 5
    max_claims_investigated: int = 4
    fetch_page_text: bool = True
    max_page_bytes: int = 900_000

    # ---- Storage ----------------------------------------------------------
    database_url: str = "sqlite+aiosqlite:///./reality_check.db"

    # ---- Server -----------------------------------------------------------
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_upload_bytes: int = 12_000_000

    @property
    def fallback_list(self) -> list[str]:
        return [m.strip() for m in self.model_fallbacks.split(",") if m.strip()]

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
