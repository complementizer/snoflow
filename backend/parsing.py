from __future__ import annotations

import json
import re
from typing import Any


def parse_extraction_response(response_text: str, source_text: str) -> list[dict[str, Any]]:
    """Parse LLM NER output into span dicts with start/end positions.

    Mirrors the logic in snoflow/src/services/llm/types.ts parseExtractionResponse.
    """
    try:
        json_match = re.search(r"\[[\s\S]*\]", response_text)
        if not json_match:
            return []
        parsed = json.loads(json_match.group())
        if not isinstance(parsed, list):
            return []

        items = [e for e in parsed if isinstance(e, dict) and isinstance(e.get("mention"), str)]
    except (json.JSONDecodeError, TypeError):
        return []

    spans: list[dict[str, Any]] = []
    search_from = 0

    for e in items:
        mention: str = e["mention"]
        entity_type: str = e.get("entityType", e.get("entity_type", "finding"))

        idx = source_text.find(mention, search_from)
        if idx == -1:
            idx = source_text.lower().find(mention.lower(), search_from)
            if idx == -1:
                continue
            mention = source_text[idx : idx + len(mention)]

        spans.append({
            "mention": mention,
            "entity_type": entity_type,
            "start": idx,
            "end": idx + len(mention),
        })
        search_from = idx + len(mention)

    return spans


def parse_linking_response(response_text: str) -> dict[str, Any]:
    """Parse LLM linking/analysis output into a structured dict."""
    try:
        json_match = re.search(r"\{[\s\S]*\}", response_text)
        if not json_match:
            return {"reasoning": response_text[:500]}
        parsed = json.loads(json_match.group())
        return parsed
    except (json.JSONDecodeError, TypeError):
        return {"reasoning": response_text[:500]}
