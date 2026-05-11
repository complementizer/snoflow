from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared candidate model (snake_case, matching existing backend)
# ---------------------------------------------------------------------------

class SnomedCandidate(BaseModel):
    concept_id: str
    score: float
    term: str
    fsn: str
    semantic_tag: Optional[str] = None


# ---------------------------------------------------------------------------
# POST /api/v1/extract  (existing-backend-compatible)
# ---------------------------------------------------------------------------

class ExtractionRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000)
    top_k: Optional[int] = Field(default=10, ge=1, le=100)
    agentic_search: Optional[bool] = None

class ExtractedEntity(BaseModel):
    mention: str
    type: str
    start: int
    end: int
    candidates: List[SnomedCandidate]

class ExtractionResponse(BaseModel):
    entities: List[ExtractedEntity]
    text: str
    processing_time_ms: float


# ---------------------------------------------------------------------------
# POST /api/v1/entities  (NER only)
# ---------------------------------------------------------------------------

class EntitySpan(BaseModel):
    mention: str
    entity_type: str
    start: int
    end: int

class EntitiesRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000)

class EntitiesResponse(BaseModel):
    entities: List[EntitySpan]
    text: str
    processing_time_ms: float


# ---------------------------------------------------------------------------
# POST /api/v1/linking  (rerank candidates)
# ---------------------------------------------------------------------------

class EntityForLinking(BaseModel):
    mention: str
    entity_type: str = "unknown"
    start: int
    end: int
    candidates: List[SnomedCandidate]

class AlternativeConsideration(BaseModel):
    concept_id: str
    reason: str


class RerankedEntity(BaseModel):
    mention: str
    entity_type: str
    start: int
    end: int
    candidates: List[SnomedCandidate]
    explanation: Optional[str] = None
    verdict: Optional[str] = None
    recommended_concept_id: Optional[str] = None
    key_factors: Optional[List[str]] = None
    ambiguity_note: Optional[str] = None
    alternative_considerations: Optional[List[AlternativeConsideration]] = None

class LinkingRequest(BaseModel):
    text: str = Field(..., max_length=50_000)
    entities: List[EntityForLinking]

class LinkingResponse(BaseModel):
    entities: List[RerankedEntity]
    text: str
    processing_time_ms: float


# ---------------------------------------------------------------------------
# POST /api/v1/discussion  (chat)
# ---------------------------------------------------------------------------

class DiscussionMessage(BaseModel):
    role: str
    content: str

class DiscussionRequest(BaseModel):
    text: str = Field(..., max_length=50_000)
    messages: List[DiscussionMessage]

class DiscussionResponse(BaseModel):
    response: str
    processing_time_ms: float


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    llm_backend: str
    llm_model: str
    snowstorm_available: bool
    models_loaded: bool
    version: str


# ---------------------------------------------------------------------------
# GET /api/v1/concepts/{concept_id}/hierarchy
# ---------------------------------------------------------------------------

class ConceptInfo(BaseModel):
    concept_id: str
    term: str
    fsn: str

class ConceptRelationship(BaseModel):
    type: str
    type_id: str
    target: ConceptInfo

class HierarchyResponse(BaseModel):
    concept: ConceptInfo
    parents: List[ConceptInfo]
    children: List[ConceptInfo]
    children_truncated: bool = False
    relationships: List[ConceptRelationship]
