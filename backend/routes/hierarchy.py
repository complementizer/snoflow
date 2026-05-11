from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..deps import get_snowstorm
from ..models import HierarchyResponse

router = APIRouter()


@router.get(
    "/api/v1/concepts/{concept_id}/hierarchy",
    response_model=HierarchyResponse,
)
async def get_concept_hierarchy(concept_id: str) -> HierarchyResponse:
    snowstorm = get_snowstorm()
    hierarchy = await snowstorm.get_hierarchy(concept_id)

    if hierarchy is None:
        raise HTTPException(status_code=404, detail=f"Concept {concept_id} not found")

    return HierarchyResponse(**hierarchy)
