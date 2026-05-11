from __future__ import annotations

from fastapi import APIRouter

from ..deps import get_config, get_llm, get_snowstorm
from ..models import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    cfg = get_config()

    snowstorm_ok = False
    try:
        snowstorm_ok = await get_snowstorm().check_health()
    except Exception:
        pass

    model = (
        cfg.openai_model
        if cfg.llm_backend == "openai"
        else cfg.anthropic_model
        if cfg.llm_backend == "anthropic"
        else cfg.azure_openai_deployment_name or ""
    )

    return HealthResponse(
        status="healthy",
        llm_backend=cfg.llm_backend,
        llm_model=model,
        snowstorm_available=snowstorm_ok,
        models_loaded=True,
        version="1.0.0",
    )
