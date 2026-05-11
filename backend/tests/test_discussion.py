def test_discussion_returns_response(client, mock_llm):
    mock_llm.complete_response = "The key findings are chest pain and diabetes."

    resp = client.post("/api/v1/discussion", json={
        "text": "Patient has chest pain and diabetes.",
        "messages": [{"role": "user", "content": "What are the key findings?"}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["response"] == "The key findings are chest pain and diabetes."
    assert "processing_time_ms" in data


def test_discussion_multi_turn(client, mock_llm):
    mock_llm.complete_response = "Yes, metformin is appropriate for type 2 diabetes."

    resp = client.post("/api/v1/discussion", json={
        "text": "Patient with type 2 diabetes on metformin.",
        "messages": [
            {"role": "user", "content": "Is metformin appropriate here?"},
            {"role": "assistant", "content": "Let me check..."},
            {"role": "user", "content": "What do you think?"},
        ],
    })
    assert resp.status_code == 200
    assert "metformin" in resp.json()["response"].lower()
