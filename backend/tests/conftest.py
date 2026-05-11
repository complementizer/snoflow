from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import deps
from backend.config import BackendConfig
from backend.llm.base import LLMClient


class MockLLMClient(LLMClient):

    def __init__(self):
        self.complete_response = "[]"
        self.tool_responses: list[tuple[str, list[dict]]] = []
        self._tool_call_idx = 0

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
        json_mode: bool = False,
    ) -> str:
        return self.complete_response

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        system: str,
        temperature: float = 0.3,
        max_tokens: int = 2000,
    ) -> tuple[str, list[dict[str, Any]]]:
        if self._tool_call_idx < len(self.tool_responses):
            result = self.tool_responses[self._tool_call_idx]
            self._tool_call_idx += 1
            return result
        return ("end_turn", [{"type": "text", "text": "Done."}])

    async def test_connection(self) -> bool:
        return True


class MockSnowstormClient:

    async def search_descriptions(self, term, limit=10, semantic_tag=None):
        return [
            {
                "concept_id": "29857009",
                "term": "Chest pain",
                "fsn": "Chest pain (finding)",
                "semantic_tag": "finding",
                "score": 0.95,
            },
            {
                "concept_id": "426396005",
                "term": "Cardiac chest pain",
                "fsn": "Cardiac chest pain (finding)",
                "semantic_tag": "finding",
                "score": 0.85,
            },
        ]

    async def get_hierarchy(self, concept_id):
        return {
            "concept": {"concept_id": concept_id, "term": "Chest pain", "fsn": "Chest pain (finding)"},
            "parents": [{"concept_id": "22253000", "term": "Pain", "fsn": "Pain (finding)"}],
            "children": [{"concept_id": "426396005", "term": "Cardiac chest pain", "fsn": "Cardiac chest pain (finding)"}],
            "children_truncated": False,
            "relationships": [],
        }

    async def check_health(self):
        return True

    async def close(self):
        pass


def _create_test_app(mock_llm: MockLLMClient, mock_snowstorm: MockSnowstormClient) -> FastAPI:
    """Create a FastAPI app with mocks injected (no real lifespan)."""
    from backend.routes import entities, extract, discussion, health, hierarchy, linking

    @asynccontextmanager
    async def test_lifespan(app: FastAPI):
        deps.config = BackendConfig(openai_api_key="test-key", llm_backend="openai")
        deps.llm_client = mock_llm
        deps.snowstorm_client = mock_snowstorm
        yield

    app = FastAPI(lifespan=test_lifespan)
    app.include_router(health.router)
    app.include_router(extract.router)
    app.include_router(entities.router)
    app.include_router(linking.router)
    app.include_router(discussion.router)
    app.include_router(hierarchy.router)
    return app


@pytest.fixture
def mock_llm():
    return MockLLMClient()


@pytest.fixture
def mock_snowstorm():
    return MockSnowstormClient()


@pytest.fixture
def client(mock_llm, mock_snowstorm):
    app = _create_test_app(mock_llm, mock_snowstorm)
    with TestClient(app) as c:
        yield c
