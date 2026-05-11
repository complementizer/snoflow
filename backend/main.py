from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from . import deps
from .config import BackendConfig
from .llm.factory import create_llm_client
from .snowstorm.client import SnowstormClient
from .routes import entities, extract, discussion, health, hierarchy, linking

logger = logging.getLogger("snoflow")
logging.basicConfig(level=logging.INFO, format="%(message)s")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        method = request.method
        path = request.url.path
        logger.info(f"  --> {method} {path}")
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            f"  <-- {method} {path} {response.status_code} ({duration_ms:.0f}ms)"
        )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = BackendConfig()
    deps.config = cfg

    print("=" * 60)
    print("  snoflow LLM Backend")
    print("=" * 60)
    print(f"  LLM backend:  {cfg.llm_backend}")

    try:
        deps.llm_client = create_llm_client(cfg)
        print(f"  LLM client:   ready")
    except Exception as e:
        print(f"  LLM client:   FAILED — {e}")

    deps.snowstorm_client = SnowstormClient(
        cfg.snowstorm_url,
        cache_file=cfg.snowstorm_cache_file,
        cache_only=cfg.snowstorm_cache_only,
    )
    if cfg.snowstorm_cache_only:
        print(f"  Snowstorm:    cache-only mode ({cfg.snowstorm_cache_file})")
        snowstorm_ok = True
    else:
        snowstorm_ok = await deps.snowstorm_client.check_health()
        print(f"  Snowstorm:    {'connected' if snowstorm_ok else 'unavailable'} ({cfg.snowstorm_url})")
    if cfg.snowstorm_cache_file and not cfg.snowstorm_cache_only:
        print(f"  Cache:        {cfg.snowstorm_cache_file}")
    print(f"  Agentic:      {'enabled' if cfg.agentic_search_enabled else 'disabled'}")
    print("=" * 60)

    yield

    if deps.snowstorm_client:
        await deps.snowstorm_client.close()
    print("snoflow LLM Backend shutting down.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="snoflow LLM Backend",
        description=(
            "LLM-powered SNOMED CT entity extraction and linking.\n\n"
            "## Endpoints\n"
            "- **POST /api/v1/extract** — NER + linking (compatible with existing backend)\n"
            "- **POST /api/v1/entities** — NER only\n"
            "- **POST /api/v1/linking** — Rerank candidates\n"
            "- **POST /api/v1/discussion** — Clinical chat\n"
            "- **GET /health** — Health check\n"
            "- **GET /api/v1/concepts/{id}/hierarchy** — SNOMED hierarchy (via Snowstorm)\n"
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(extract.router)
    app.include_router(entities.router)
    app.include_router(linking.router)
    app.include_router(discussion.router)
    app.include_router(hierarchy.router)

    return app


app = create_app()
