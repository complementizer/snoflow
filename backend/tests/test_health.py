def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["models_loaded"] is True
    assert data["snowstorm_available"] is True
    assert data["llm_backend"] == "openai"
    assert data["version"] == "1.0.0"
