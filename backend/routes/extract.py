from __future__ import annotations

import asyncio
import time
from pathlib import Path

from fastapi import APIRouter

from ..deps import get_config, get_llm, get_snowstorm
from ..models import (
    ExtractionRequest,
    ExtractionResponse,
    ExtractedEntity,
    SnomedCandidate,
)
from ..parsing import parse_extraction_response
from ..prompts.loader import load_prompt_template
from ..snowstorm.agentic_search import agentic_search

router = APIRouter()


async def _link_entity(
    mention: str,
    entity_type: str,
    start: int,
    end: int,
    text: str,
    top_k: int,
    use_agentic: bool,
) -> ExtractedEntity:
    cfg = get_config()
    snowstorm = get_snowstorm()

    candidates = await snowstorm.search_descriptions(mention, limit=top_k + 5)

    if use_agentic and (
        not candidates or candidates[0]["score"] < cfg.agentic_search_score_threshold
    ):
        llm = get_llm()
        prompts_dir = Path(cfg.prompts_dir) if cfg.prompts_dir else None

        context_start = max(0, start - 200)
        context_end = min(len(text), end + 200)
        context = text[context_start:context_end]

        candidates, _ = await agentic_search(
            llm=llm,
            snowstorm=snowstorm,
            mention=mention,
            context=context,
            entity_type=entity_type,
            initial_candidates=candidates,
            max_turns=cfg.agentic_search_max_turns,
            prompts_dir=prompts_dir,
            temperature=cfg.llm_temperature,
            max_tokens=cfg.llm_max_tokens,
        )

    return ExtractedEntity(
        mention=mention,
        type=entity_type,
        start=start,
        end=end,
        candidates=[
            SnomedCandidate(**c) for c in candidates[:top_k]
        ],
    )


@router.post("/api/v1/extract", response_model=ExtractionResponse)
async def extract_and_link(request: ExtractionRequest) -> ExtractionResponse:
    start_time = time.perf_counter()
    cfg = get_config()
    llm = get_llm()

    prompts_dir = Path(cfg.prompts_dir) if cfg.prompts_dir else None
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

    use_agentic = (
        request.agentic_search
        if request.agentic_search is not None
        else cfg.agentic_search_enabled
    )
    top_k = request.top_k or 10

    entities = await asyncio.gather(
        *[
            _link_entity(
                mention=s["mention"],
                entity_type=s["entity_type"],
                start=s["start"],
                end=s["end"],
                text=request.text,
                top_k=top_k,
                use_agentic=use_agentic,
            )
            for s in spans
        ]
    )

    return ExtractionResponse(
        entities=list(entities),
        text=request.text,
        processing_time_ms=(time.perf_counter() - start_time) * 1000,
    )
