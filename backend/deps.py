from __future__ import annotations

from typing import Optional

from .config import BackendConfig
from .llm.base import LLMClient
from .snowstorm.client import SnowstormClient

config: BackendConfig = BackendConfig()
llm_client: Optional[LLMClient] = None
snowstorm_client: Optional[SnowstormClient] = None


def get_config() -> BackendConfig:
    return config


def get_llm() -> LLMClient:
    if llm_client is None:
        raise RuntimeError("LLM client not initialized")
    return llm_client


def get_snowstorm() -> SnowstormClient:
    if snowstorm_client is None:
        raise RuntimeError("Snowstorm client not initialized")
    return snowstorm_client
