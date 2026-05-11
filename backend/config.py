from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional

from pydantic_settings import BaseSettings

# Resolve .env path relative to snoflow/ directory (parent of backend/)
_SNOFLOW_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _SNOFLOW_DIR / ".env"
_ENV_LOCAL = _SNOFLOW_DIR / ".env.local"


class BackendConfig(BaseSettings):
    llm_backend: Literal["openai", "azure-openai", "anthropic"] = "openai"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"

    azure_openai_endpoint: Optional[str] = None
    azure_openai_api_key: Optional[str] = None
    azure_openai_deployment_name: Optional[str] = None
    azure_openai_api_version: str = "2024-02-15-preview"

    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-sonnet-4-20250514"

    snowstorm_url: str = "https://browser.ihtsdotools.org/snowstorm/snomed-ct"
    snowstorm_cache_file: Optional[str] = None
    snowstorm_cache_only: bool = False

    agentic_search_enabled: bool = False
    agentic_search_max_turns: int = 5
    agentic_search_score_threshold: float = 0.85

    host: str = "0.0.0.0"
    port: int = 8001

    prompts_dir: Optional[str] = None

    llm_temperature: float = 0.1
    llm_max_tokens: int = 4096

    model_config = {"env_prefix": "SNOFLOW_", "env_file": (_ENV_FILE, _ENV_LOCAL), "extra": "ignore"}
