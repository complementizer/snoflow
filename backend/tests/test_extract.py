import json


def test_extract_returns_entities_with_candidates(client, mock_llm):
    mock_llm.complete_response = json.dumps([
        {"mention": "chest pain", "entityType": "finding"},
    ])

    resp = client.post("/api/v1/extract", json={
        "text": "Patient has chest pain.",
        "top_k": 5,
    })
    assert resp.status_code == 200
    data = resp.json()

    assert data["text"] == "Patient has chest pain."
    assert "processing_time_ms" in data
    assert len(data["entities"]) == 1

    entity = data["entities"][0]
    assert entity["mention"] == "chest pain"
    assert entity["type"] == "finding"
    assert entity["start"] == 12
    assert entity["end"] == 22
    assert len(entity["candidates"]) > 0

    cand = entity["candidates"][0]
    assert "concept_id" in cand
    assert "score" in cand
    assert "term" in cand
    assert "fsn" in cand


def test_extract_compatible_with_custom_backend_schema(client, mock_llm):
    """Verify the response schema matches what CustomBackendResolver expects."""
    mock_llm.complete_response = json.dumps([
        {"mention": "hypertension", "entityType": "disorder"},
    ])

    resp = client.post("/api/v1/extract", json={"text": "History of hypertension."})
    data = resp.json()

    assert "entities" in data
    assert "text" in data
    assert "processing_time_ms" in data

    for entity in data["entities"]:
        assert "mention" in entity
        assert "type" in entity
        assert "start" in entity
        assert "end" in entity
        assert "candidates" in entity
        for c in entity["candidates"]:
            assert "concept_id" in c
            assert "score" in c
            assert "term" in c
            assert "fsn" in c
