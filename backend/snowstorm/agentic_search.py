from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from ..llm.base import LLMClient
from ..prompts.loader import load_prompt_template
from .client import SnowstormClient


SEARCH_SNOWSTORM_TOOL = {
    "name": "search_snowstorm",
    "description": (
        "Search SNOMED CT descriptions via Snowstorm terminology server. "
        "Use different query terms, synonyms, or abbreviation expansions to find better candidates."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search term for SNOMED CT descriptions",
            },
            "semantic_tag": {
                "type": "string",
                "description": "Optional filter: finding, procedure, body structure, disorder, etc.",
            },
            "limit": {
                "type": "integer",
                "default": 10,
                "description": "Max results to return",
            },
        },
        "required": ["query"],
    },
}

SUBMIT_CANDIDATES_TOOL = {
    "name": "submit_candidates",
    "description": "Submit the final ranked list of SNOMED candidate concepts. Call this when satisfied with search results.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ranked_concept_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Concept IDs ordered from best match to worst",
            },
            "reasoning": {
                "type": "string",
                "description": "Brief explanation of why these candidates were chosen",
            },
        },
        "required": ["ranked_concept_ids", "reasoning"],
    },
}

AGENTIC_SEARCH_TOOLS = [SEARCH_SNOWSTORM_TOOL, SUBMIT_CANDIDATES_TOOL]


def _format_candidates_for_prompt(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "(no results)"
    lines = []
    for i, c in enumerate(candidates[:10], 1):
        lines.append(
            f"{i}. [{c['concept_id']}] {c['term']} — {c['fsn']} "
            f"(score: {c['score']:.3f})"
        )
    return "\n".join(lines)


async def agentic_search(
    llm: LLMClient,
    snowstorm: SnowstormClient,
    mention: str,
    context: str,
    entity_type: str,
    initial_candidates: list[dict[str, Any]],
    max_turns: int = 5,
    prompts_dir: Optional[Path] = None,
    temperature: float = 0.3,
    max_tokens: int = 2000,
) -> tuple[list[dict[str, Any]], str]:
    """Run the agentic Snowstorm search loop.

    Returns (candidates, reasoning) where candidates is a deduplicated,
    ranked list of all candidates found across searches.
    """
    all_candidates: dict[str, dict[str, Any]] = {}
    for c in initial_candidates:
        cid = c["concept_id"]
        if cid not in all_candidates or c["score"] > all_candidates[cid]["score"]:
            all_candidates[cid] = c

    system_prompt = load_prompt_template("agentic_search_system", prompts_dir=prompts_dir)
    system_prompt = system_prompt.format(max_turns=max_turns)

    user_template = load_prompt_template("agentic_search_user", prompts_dir=prompts_dir)
    user_message = user_template.format(
        mention=mention,
        entity_type=entity_type or "Unknown",
        context=context,
        initial_results=_format_candidates_for_prompt(initial_candidates),
    )

    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]
    turns = 0
    final_reasoning = ""

    while turns < max_turns:
        turns += 1

        stop_reason, content_blocks = await llm.chat_with_tools(
            messages=messages,
            tools=AGENTIC_SEARCH_TOOLS,
            system=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        if stop_reason == "end_turn" and not any(
            b.get("type") == "tool_use" for b in content_blocks
        ):
            messages.append({"role": "assistant", "content": content_blocks})
            messages.append({
                "role": "user",
                "content": (
                    "You must call either `search_snowstorm` to try new queries "
                    "or `submit_candidates` to finalize your results."
                ),
            })
            continue

        tool_results = []
        submitted = False

        for block in content_blocks:
            if block.get("type") != "tool_use":
                continue

            tool_name = block["name"]
            tool_input = block["input"]
            tool_id = block["id"]

            if tool_name == "search_snowstorm":
                query = tool_input.get("query", mention)
                semantic_tag = tool_input.get("semantic_tag")
                limit = tool_input.get("limit", 10)

                results = await snowstorm.search_descriptions(
                    term=query, limit=limit, semantic_tag=semantic_tag
                )

                for c in results:
                    cid = c["concept_id"]
                    if cid not in all_candidates or c["score"] > all_candidates[cid]["score"]:
                        all_candidates[cid] = c

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": json.dumps({
                        "results": [
                            {
                                "concept_id": c["concept_id"],
                                "term": c["term"],
                                "fsn": c["fsn"],
                                "semantic_tag": c.get("semantic_tag", ""),
                                "score": c["score"],
                            }
                            for c in results[:10]
                        ],
                        "total_found": len(results),
                    }),
                })

            elif tool_name == "submit_candidates":
                ranked_ids = tool_input.get("ranked_concept_ids", [])
                final_reasoning = tool_input.get("reasoning", "")

                final_candidates = []
                for rank, cid in enumerate(ranked_ids):
                    if cid in all_candidates:
                        c = dict(all_candidates[cid])
                        c["score"] = max(c["score"], 1.0 - rank * 0.02)
                        final_candidates.append(c)

                for cid, c in all_candidates.items():
                    if cid not in ranked_ids:
                        final_candidates.append(c)

                submitted = True
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": json.dumps({"status": "submitted", "count": len(final_candidates)}),
                })
                return final_candidates, final_reasoning

        messages.append({"role": "assistant", "content": content_blocks})
        if tool_results:
            messages.append({"role": "user", "content": tool_results})

    sorted_candidates = sorted(all_candidates.values(), key=lambda c: c["score"], reverse=True)
    return sorted_candidates, final_reasoning or "Max turns reached; returning best candidates found."
