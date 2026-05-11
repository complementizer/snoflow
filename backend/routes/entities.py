from __future__ import annotations

import time

from fastapi import APIRouter

from ..deps import get_config, get_llm
from ..models import EntitiesRequest, EntitiesResponse, EntitySpan
from ..parsing import parse_extraction_response
from ..prompts.loader import load_prompt_template

router = APIRouter()


@router.post("/api/v1/entities", response_model=EntitiesResponse)
async def extract_entities(request: EntitiesRequest) -> EntitiesResponse:
    start = time.perf_counter()
    cfg = get_config()
    llm = get_llm()

    prompts_dir = None
    if cfg.prompts_dir:
        from pathlib import Path
        prompts_dir = Path(cfg.prompts_dir)

    system_prompt = load_prompt_template("ner_system", prompts_dir=prompts_dir)
    user_template = load_prompt_template("ner_user", prompts_dir=prompts_dir)
    user_prompt = user_template.format(text=request.text)

    raw = await llm.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=cfg.llm_temperature,
        max_tokens=cfg.llm_max_tokens,
    )

    spans = parse_extraction_response(raw, request.text)

    entities = [
        EntitySpan(
            mention=s["mention"],
            entity_type=s["entity_type"],
            start=s["start"],
            end=s["end"],
        )
        for s in spans
    ]

    return EntitiesResponse(
        entities=entities,
        text=request.text,
        processing_time_ms=(time.perf_counter() - start) * 1000,
    )
