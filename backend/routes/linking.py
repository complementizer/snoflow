from __future__ import annotations

import time

from fastapi import APIRouter

from ..deps import get_config, get_llm
from ..models import (
    AlternativeConsideration,
    LinkingRequest,
    LinkingResponse,
    RerankedEntity,
    SnomedCandidate,
)
from ..parsing import parse_linking_response
from ..prompts.loader import load_prompt_template

router = APIRouter()


def _format_candidates_text(candidates: list[SnomedCandidate]) -> str:
    lines = []
    for i, c in enumerate(candidates[:10], 1):
        lines.append(
            f"{i}. [{c.concept_id}] {c.term} ({c.semantic_tag or 'unknown'}) "
            f"— Score: {c.score * 100:.1f}%"
        )
    return "\n".join(lines)


@router.post("/api/v1/linking", response_model=LinkingResponse)
async def link_entities(request: LinkingRequest) -> LinkingResponse:
    start = time.perf_counter()
    cfg = get_config()
    llm = get_llm()

    prompts_dir = None
    if cfg.prompts_dir:
        from pathlib import Path
        prompts_dir = Path(cfg.prompts_dir)

    system_prompt = load_prompt_template("linking_system", prompts_dir=prompts_dir)
    user_template = load_prompt_template("linking_user", prompts_dir=prompts_dir)

    results: list[RerankedEntity] = []

    for entity in request.entities:
        context_start = max(0, entity.start - 200)
        context_end = min(len(request.text), entity.end + 200)
        context = request.text[context_start:context_end]

        candidates_text = _format_candidates_text(entity.candidates)

        user_prompt = user_template.format(
            mention=entity.mention,
            entity_type=entity.entity_type,
            context=context,
            candidates_text=candidates_text,
        )

        raw = await llm.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=cfg.llm_temperature,
            max_tokens=1000,
            json_mode=True,
        )

        parsed = parse_linking_response(raw)
        explanation = parsed.get("reasoning", "")
        verdict = parsed.get("verdict")
        recommended = parsed.get("recommendedConceptId")
        key_factors = parsed.get("keyFactors", [])
        ambiguity_note = parsed.get("ambiguityNote")
        alt_considerations_raw = parsed.get("alternativeConsiderations", [])

        alt_considerations = None
        if alt_considerations_raw:
            alt_considerations = [
                AlternativeConsideration(
                    concept_id=a.get("conceptId", ""),
                    reason=a.get("reason", ""),
                )
                for a in alt_considerations_raw
                if isinstance(a, dict) and a.get("conceptId")
            ] or None

        reranked_ids = parsed.get("rerankedCandidateIds", [])
        candidate_map = {c.concept_id: c for c in entity.candidates}

        if reranked_ids:
            reranked = []
            for cid in reranked_ids:
                if cid in candidate_map:
                    reranked.append(candidate_map.pop(cid))
            for c in entity.candidates:
                if c.concept_id in candidate_map:
                    reranked.append(c)
        else:
            if recommended and recommended in candidate_map:
                top = candidate_map.pop(recommended)
                reranked = [top] + [c for c in entity.candidates if c.concept_id != recommended]
            else:
                reranked = list(entity.candidates)

        results.append(
            RerankedEntity(
                mention=entity.mention,
                entity_type=entity.entity_type,
                start=entity.start,
                end=entity.end,
                candidates=reranked,
                explanation=explanation,
                verdict=verdict,
                recommended_concept_id=recommended,
                key_factors=key_factors or None,
                ambiguity_note=ambiguity_note,
                alternative_considerations=alt_considerations,
            )
        )

    return LinkingResponse(
        entities=results,
        text=request.text,
        processing_time_ms=(time.perf_counter() - start) * 1000,
    )
