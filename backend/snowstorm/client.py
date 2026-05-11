from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger("snoflow")


def _parse_semantic_tag(fsn: str) -> str:
    m = re.search(r"\(([^)]+)\)$", fsn)
    return m.group(1) if m else "unknown"


def _compute_match_score(search_term: str, candidate_term: str, candidate_fsn: str) -> float:
    search = search_term.lower().strip()
    term = candidate_term.lower().strip()
    fsn = candidate_fsn.lower().strip()

    if term == search:
        return 1.0
    if fsn.startswith(search + " ("):
        return 0.98
    if term.startswith(search) or search.startswith(term):
        return 0.95

    search_words = search.split()
    term_words = term.split()
    overlap = len(set(search_words) & set(term_words))
    denom = max(len(search_words), len(term_words))
    overlap_ratio = overlap / denom if denom > 0 else 0
    return 0.70 + overlap_ratio * 0.20


class SnowstormClient:

    def __init__(
        self,
        base_url: str = "https://browser.ihtsdotools.org/snowstorm/snomed-ct",
        cache_file: Optional[str] = None,
        cache_only: bool = False,
    ):
        self._base_url = base_url.rstrip("/")
        self._semaphore = asyncio.Semaphore(3)
        self._http = httpx.AsyncClient(timeout=30.0, headers={"Accept-Language": "en"})
        self._cache_file = Path(cache_file) if cache_file else None
        self._cache_only = cache_only
        self._cache: dict[str, Any] = {}
        if self._cache_file and self._cache_file.exists():
            with open(self._cache_file) as f:
                self._cache = json.load(f)
            logger.info(f"  Snowstorm cache: loaded {len(self._cache)} entries from {self._cache_file}")

    def _save_cache(self) -> None:
        if not self._cache_file:
            return
        self._cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self._cache_file, "w") as f:
            json.dump(self._cache, f, indent=2, ensure_ascii=False)

    async def close(self):
        await self._http.aclose()

    async def _fetch_json(self, path: str, retries: int = 2) -> Any:
        if path in self._cache:
            return self._cache[path]

        if self._cache_only:
            raise RuntimeError(f"Snowstorm cache miss (cache_only=true): {path}")

        async with self._semaphore:
            for attempt in range(retries + 1):
                resp = await self._http.get(f"{self._base_url}{path}")
                if resp.status_code == 429 and attempt < retries:
                    await asyncio.sleep(1.0 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                if self._cache_file:
                    self._cache[path] = data
                    self._save_cache()
                return data
            raise RuntimeError("Snowstorm: max retries exceeded")

    async def search_descriptions(
        self,
        term: str,
        limit: int = 10,
        semantic_tag: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        params = {
            "term": term,
            "active": "true",
            "conceptActive": "true",
            "groupByConcept": "true",
            "limit": str(limit),
        }
        if semantic_tag:
            params["semanticTag"] = semantic_tag

        qs = "&".join(f"{k}={v}" for k, v in params.items())
        data = await self._fetch_json(f"/browser/MAIN/descriptions?{qs}")

        seen: set[str] = set()
        candidates: list[dict[str, Any]] = []

        for item in data.get("items", []):
            concept_id = item["concept"]["conceptId"]
            if concept_id in seen:
                continue
            seen.add(concept_id)

            fsn = item["concept"]["fsn"]["term"]
            pt = item["concept"]["pt"]["term"]

            candidates.append({
                "concept_id": concept_id,
                "term": pt,
                "fsn": fsn,
                "semantic_tag": _parse_semantic_tag(fsn),
                "score": _compute_match_score(term, pt, fsn),
            })

        candidates.sort(key=lambda c: c["score"], reverse=True)
        return candidates

    async def get_concept_details(self, concept_id: str) -> Optional[dict[str, Any]]:
        try:
            data = await self._fetch_json(f"/browser/MAIN/concepts/{concept_id}")
            return {
                "concept_id": data["conceptId"],
                "term": data["pt"]["term"],
                "fsn": data["fsn"]["term"],
            }
        except Exception:
            return None

    async def get_parents(self, concept_id: str) -> list[dict[str, Any]]:
        try:
            data = await self._fetch_json(f"/MAIN/concepts/{concept_id}/parents?form=inferred")
            return [
                {"concept_id": c["conceptId"], "term": c["pt"]["term"], "fsn": c["fsn"]["term"]}
                for c in data
            ]
        except Exception:
            return []

    async def get_children(self, concept_id: str) -> list[dict[str, Any]]:
        try:
            data = await self._fetch_json(f"/browser/MAIN/concepts/{concept_id}/children?form=inferred")
            return [
                {"concept_id": c["conceptId"], "term": c["pt"]["term"], "fsn": c["fsn"]["term"]}
                for c in data
            ]
        except Exception:
            return []

    async def get_hierarchy(self, concept_id: str) -> Optional[dict[str, Any]]:
        try:
            concept, parents, children = await asyncio.gather(
                self.get_concept_details(concept_id),
                self.get_parents(concept_id),
                self.get_children(concept_id),
            )
            if not concept:
                return None
            return {
                "concept": concept,
                "parents": parents,
                "children": children[:50],
                "children_truncated": len(children) > 50,
                "relationships": [],
            }
        except Exception:
            return None

    async def check_health(self) -> bool:
        try:
            data = await self._fetch_json("/browser/MAIN/descriptions?term=test&limit=1")
            return isinstance(data.get("items"), list)
        except Exception:
            return False
