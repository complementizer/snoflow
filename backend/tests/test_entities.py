import json


def test_entities_extracts_spans(client, mock_llm):
    mock_llm.complete_response = json.dumps([
        {"mention": "chest pain", "entityType": "finding"},
        {"mention": "diabetes mellitus", "entityType": "disorder"},
    ])

    resp = client.post("/api/v1/entities", json={
        "text": "Patient has chest pain and type 2 diabetes mellitus."
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["entities"]) == 2

    e0 = data["entities"][0]
    assert e0["mention"] == "chest pain"
    assert e0["entity_type"] == "finding"
    assert e0["start"] == 12
    assert e0["end"] == 22

    e1 = data["entities"][1]
    assert e1["mention"] == "diabetes mellitus"
    assert e1["entity_type"] == "disorder"


def test_entities_empty_text_rejected(client):
    resp = client.post("/api/v1/entities", json={"text": ""})
    assert resp.status_code == 422


def test_entities_no_entities_found(client, mock_llm):
    mock_llm.complete_response = "[]"

    resp = client.post("/api/v1/entities", json={
        "text": "This text has no medical terms."
    })
    assert resp.status_code == 200
    assert len(resp.json()["entities"]) == 0


def test_entities_malformed_llm_response(client, mock_llm):
    mock_llm.complete_response = "Sorry, I cannot help with that."

    resp = client.post("/api/v1/entities", json={
        "text": "Patient has chest pain."
    })
    assert resp.status_code == 200
    assert len(resp.json()["entities"]) == 0
