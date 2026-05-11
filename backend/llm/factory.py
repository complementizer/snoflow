from __future__ import annotations

from ..config import BackendConfig
from .base import LLMClient


def create_llm_client(config: BackendConfig) -> LLMClient:
    if config.llm_backend == "openai":
        if not config.openai_api_key:
            raise ValueError("SNOFLOW_OPENAI_API_KEY is required for OpenAI backend")
        from .openai_client import OpenAIClient
        return OpenAIClient(api_key=config.openai_api_key, model=config.openai_model)

    elif config.llm_backend == "azure-openai":
        if not all([config.azure_openai_endpoint, config.azure_openai_api_key, config.azure_openai_deployment_name]):
            raise ValueError(
                "SNOFLOW_AZURE_OPENAI_ENDPOINT, SNOFLOW_AZURE_OPENAI_API_KEY, and "
                "SNOFLOW_AZURE_OPENAI_DEPLOYMENT_NAME are required for Azure OpenAI backend"
            )
        from .azure_client import AzureOpenAIClient
        return AzureOpenAIClient(
            endpoint=config.azure_openai_endpoint,
            api_key=config.azure_openai_api_key,
            deployment_name=config.azure_openai_deployment_name,
            api_version=config.azure_openai_api_version,
        )

    elif config.llm_backend == "anthropic":
        if not config.anthropic_api_key:
            raise ValueError("SNOFLOW_ANTHROPIC_API_KEY is required for Anthropic backend")
        from .anthropic_client import AnthropicClient
        return AnthropicClient(api_key=config.anthropic_api_key, model=config.anthropic_model)

    raise ValueError(f"Unknown LLM backend: {config.llm_backend}")
