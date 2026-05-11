#!/usr/bin/env python3
"""Quick smoke test for the Snowstorm terminology server."""

import json
import ssl
import sys
import time
import urllib.request
import urllib.parse

SNOWSTORM_BASE_URL = "https://browser.ihtsdotools.org/snowstorm/snomed-ct"

TEST_QUERIES = [
    "diabetes mellitus",
    "myocardial infarction",
    "aspirin",
    "hypertension",
    "fracture of femur",
    "pneumonia",
    "headache",
    "appendectomy",
    "MRI of brain",
    "blood glucose measurement",
]

TEST_CONCEPT_IDS = [
    "73211009",   # Diabetes mellitus
    "22298006",   # Myocardial infarction
    "387458008",  # Aspirin
]


_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
        return json.loads(resp.read())


def test_search(term: str, limit: int = 5) -> list[dict]:
    params = urllib.parse.urlencode({
        "term": term,
        "active": "true",
        "conceptActive": "true",
        "groupByConcept": "true",
        "limit": str(limit),
    })
    url = f"{SNOWSTORM_BASE_URL}/browser/MAIN/descriptions?{params}"
    data = fetch_json(url)
    results = []
    seen = set()
    for item in data.get("items", []):
        cid = item["concept"]["conceptId"]
        if cid in seen:
            continue
        seen.add(cid)
        results.append({
            "conceptId": cid,
            "pt": item["concept"]["pt"]["term"],
            "fsn": item["concept"]["fsn"]["term"],
        })
    return results


def test_concept_lookup(concept_id: str) -> dict | None:
    url = f"{SNOWSTORM_BASE_URL}/browser/MAIN/concepts/{concept_id}"
    data = fetch_json(url)
    return {
        "conceptId": data["conceptId"],
        "pt": data["pt"]["term"],
        "fsn": data["fsn"]["term"],
        "active": data["active"],
    }


def main():
    print("=" * 70)
    print("Snowstorm Endpoint Test")
    print(f"Base URL: {SNOWSTORM_BASE_URL}")
    print("=" * 70)

    # Health check
    print("\n--- Health Check ---")
    try:
        results = test_search("test", limit=1)
        print(f"  OK – got {len(results)} result(s)")
    except Exception as e:
        print(f"  FAIL – {e}")
        sys.exit(1)

    # Description searches
    print("\n--- Description Search ---")
    for term in TEST_QUERIES:
        time.sleep(0.3)
        try:
            results = test_search(term)
            top = results[0] if results else None
            if top:
                print(f"  '{term}' -> {top['conceptId']} | {top['pt']} | {top['fsn']}  ({len(results)} total)")
            else:
                print(f"  '{term}' -> NO RESULTS")
        except Exception as e:
            print(f"  '{term}' -> ERROR: {e}")

    # Concept lookups
    print("\n--- Concept Lookup ---")
    for cid in TEST_CONCEPT_IDS:
        time.sleep(0.3)
        try:
            info = test_concept_lookup(cid)
            print(f"  {cid} -> {info['pt']} | {info['fsn']} | active={info['active']}")
        except Exception as e:
            print(f"  {cid} -> ERROR: {e}")

    print("\n" + "=" * 70)
    print("Done.")


if __name__ == "__main__":
    main()
