import json


def test_linking_reranks_candidates(client, mock_llm):
    mock_llm.complete_response = json.dumps({
        "verdict": "confident",
        "recommendedConceptId": "29857009",
        "reasoning": "Chest pain is a direct match.",
        "keyFactors": ["exact match"],
        "rerankedCandidateIds": ["29857009", "426396005", "274668005"],
    })

    resp = client.post("/api/v1/linking", json={
        "text": "Patient has chest pain.",
        "entities": [{
            "mention": "chest pain",
            "entity_type": "finding",
            "start": 12,
            "end": 22,
            "candidates": [
                {"concept_id": "29857009", "score": 0.95, "term": "Chest pain", "fsn": "Chest pain (finding)", "semantic_tag": "finding"},
                {"concept_id": "426396005", "score": 0.88, "term": "Cardiac chest pain", "fsn": "Cardiac chest pain (finding)", "semantic_tag": "finding"},
                {"concept_id": "274668005", "score": 0.82, "term": "Acute chest pain", "fsn": "Acute chest pain (finding)", "semantic_tag": "finding"},
            ],
        }],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["entities"]) == 1

    entity = data["entities"][0]
    assert entity["explanation"] == "Chest pain is a direct match."
    assert len(entity["candidates"]) == 3
    assert entity["candidates"][0]["concept_id"] == "29857009"


def test_linking_with_recommended_concept(client, mock_llm):
    mock_llm.complete_response = json.dumps({
        "verdict": "likely",
        "recommendedConceptId": "426396005",
        "reasoning": "In cardiac context, cardiac chest pain is more appropriate.",
        "keyFactors": ["cardiac context"],
    })

    resp = client.post("/api/v1/linking", json={
        "text": "Patient in CCU with chest pain.",
        "entities": [{
            "mention": "chest pain",
            "entity_type": "finding",
            "start": 20,
            "end": 30,
            "candidates": [
                {"concept_id": "29857009", "score": 0.95, "term": "Chest pain", "fsn": "Chest pain (finding)", "semantic_tag": "finding"},
                {"concept_id": "426396005", "score": 0.88, "term": "Cardiac chest pain", "fsn": "Cardiac chest pain (finding)", "semantic_tag": "finding"},
            ],
        }],
    })
    assert resp.status_code == 200
    entity = resp.json()["entities"][0]
    assert entity["candidates"][0]["concept_id"] == "426396005"


def test_linking_returns_full_analysis_fields(client, mock_llm):
    mock_llm.complete_response = json.dumps({
        "verdict": "ambiguous",
        "recommendedConceptId": "29857009",
        "reasoning": "Could be general or cardiac chest pain.",
        "keyFactors": ["context unclear", "multiple valid options"],
        "ambiguityNote": "Consider cardiac workup to clarify.",
        "alternativeConsiderations": [
            {"conceptId": "426396005", "reason": "If cardiac etiology suspected"},
            {"conceptId": "274668005", "reason": "If acute onset"},
        ],
        "rerankedCandidateIds": ["29857009", "426396005", "274668005"],
    })

    resp = client.post("/api/v1/linking", json={
        "text": "Patient has chest pain.",
        "entities": [{
            "mention": "chest pain",
            "entity_type": "finding",
            "start": 12,
            "end": 22,
            "candidates": [
                {"concept_id": "29857009", "score": 0.95, "term": "Chest pain", "fsn": "Chest pain (finding)", "semantic_tag": "finding"},
                {"concept_id": "426396005", "score": 0.88, "term": "Cardiac chest pain", "fsn": "Cardiac chest pain (finding)", "semantic_tag": "finding"},
                {"concept_id": "274668005", "score": 0.82, "term": "Acute chest pain", "fsn": "Acute chest pain (finding)", "semantic_tag": "finding"},
            ],
        }],
    })
    assert resp.status_code == 200
    entity = resp.json()["entities"][0]

    assert entity["verdict"] == "ambiguous"
    assert entity["recommended_concept_id"] == "29857009"
    assert entity["explanation"] == "Could be general or cardiac chest pain."
    assert entity["key_factors"] == ["context unclear", "multiple valid options"]
    assert entity["ambiguity_note"] == "Consider cardiac workup to clarify."
    assert len(entity["alternative_considerations"]) == 2
    assert entity["alternative_considerations"][0]["concept_id"] == "426396005"
    assert entity["alternative_considerations"][0]["reason"] == "If cardiac etiology suspected"
