from backend.parsing import parse_extraction_response, parse_linking_response


def test_parse_extraction_basic():
    llm = '[{"mention": "chest pain", "entityType": "finding"}]'
    text = "Patient has chest pain."
    spans = parse_extraction_response(llm, text)
    assert len(spans) == 1
    assert spans[0]["mention"] == "chest pain"
    assert spans[0]["start"] == 12
    assert spans[0]["end"] == 22
    assert spans[0]["entity_type"] == "finding"


def test_parse_extraction_multiple():
    llm = '[{"mention": "fever", "entityType": "finding"}, {"mention": "cough", "entityType": "finding"}]'
    text = "Patient has fever and cough."
    spans = parse_extraction_response(llm, text)
    assert len(spans) == 2
    assert spans[0]["mention"] == "fever"
    assert spans[1]["mention"] == "cough"


def test_parse_extraction_with_markdown_fences():
    llm = '```json\n[{"mention": "headache", "entityType": "finding"}]\n```'
    text = "Patient reports headache."
    spans = parse_extraction_response(llm, text)
    assert len(spans) == 1
    assert spans[0]["mention"] == "headache"


def test_parse_extraction_case_insensitive_fallback():
    llm = '[{"mention": "Chest Pain", "entityType": "finding"}]'
    text = "Patient has chest pain."
    spans = parse_extraction_response(llm, text)
    assert len(spans) == 1
    assert spans[0]["mention"] == "chest pain"


def test_parse_extraction_empty():
    assert parse_extraction_response("[]", "some text") == []
    assert parse_extraction_response("no json here", "some text") == []
    assert parse_extraction_response("", "") == []


def test_parse_extraction_mention_not_found():
    llm = '[{"mention": "nonexistent term", "entityType": "finding"}]'
    text = "Patient is doing well."
    spans = parse_extraction_response(llm, text)
    assert len(spans) == 0


def test_parse_linking_response_json():
    llm = '{"verdict": "confident", "recommendedConceptId": "123", "reasoning": "exact match"}'
    result = parse_linking_response(llm)
    assert result["verdict"] == "confident"
    assert result["recommendedConceptId"] == "123"


def test_parse_linking_response_malformed():
    result = parse_linking_response("I think the best option is candidate 1.")
    assert "reasoning" in result
