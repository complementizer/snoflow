def test_hierarchy_returns_concept_tree(client):
    resp = client.get("/api/v1/concepts/29857009/hierarchy")
    assert resp.status_code == 200
    data = resp.json()

    assert data["concept"]["concept_id"] == "29857009"
    assert data["concept"]["term"] == "Chest pain"
    assert len(data["parents"]) > 0
    assert len(data["children"]) > 0
    assert data["children_truncated"] is False


def test_hierarchy_concept_not_found(client, mock_snowstorm):
    original = mock_snowstorm.get_hierarchy

    async def return_none(concept_id):
        return None

    mock_snowstorm.get_hierarchy = return_none

    resp = client.get("/api/v1/concepts/999999999/hierarchy")
    assert resp.status_code == 404

    mock_snowstorm.get_hierarchy = original
