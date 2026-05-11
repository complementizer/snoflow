# snoflow Makefile
# Usage: make test-backend  (runs all smoke tests)
#        make test-health    (test health endpoint only)
#        make test-entities  (test NER endpoint only)
#        make start-backend  (start the backend server)

BACKEND_URL ?= http://localhost:8001
SAMPLE_TEXT = "Patient presents with chest pain and shortness of breath. History of type 2 diabetes mellitus and hypertension. Prescribed metformin 500mg twice daily."

.PHONY: install-backend start-backend test test-backend test-health test-snowstorm \
        test-entities test-linking test-discussion test-extract test-hierarchy

# ---------------------------------------------------------------------------
# Setup (uses uv + pyproject.toml)
# ---------------------------------------------------------------------------

install-backend:
	uv sync

start-backend:
	uv run uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload

# ---------------------------------------------------------------------------
# Unit tests (mocked, no server needed)
# ---------------------------------------------------------------------------

test:
	uv run pytest backend/tests/ -v

# ---------------------------------------------------------------------------
# Smoke tests
# ---------------------------------------------------------------------------

test-backend: test-health test-snowstorm test-entities test-extract test-linking test-discussion test-hierarchy
	@echo ""
	@echo "=========================================="
	@echo "  All smoke tests passed!"
	@echo "=========================================="

test-health:
	@echo ""
	@echo "--- GET /health ---"
	@curl -s $(BACKEND_URL)/health | python3 -m json.tool
	@echo ""

test-snowstorm:
	@echo ""
	@echo "--- Snowstorm connectivity (via /health) ---"
	@STATUS=$$(curl -s $(BACKEND_URL)/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('snowstorm_available') else 'UNAVAILABLE')"); \
	echo "  Snowstorm: $$STATUS"
	@echo ""

test-entities:
	@echo ""
	@echo "--- POST /api/v1/entities (NER) ---"
	@curl -s -X POST $(BACKEND_URL)/api/v1/entities \
		-H "Content-Type: application/json" \
		-d '{"text": $(SAMPLE_TEXT)}' | python3 -m json.tool
	@echo ""

test-extract:
	@echo ""
	@echo "--- POST /api/v1/extract (NER + Snowstorm linking) ---"
	@curl -s -X POST $(BACKEND_URL)/api/v1/extract \
		-H "Content-Type: application/json" \
		-d '{"text": $(SAMPLE_TEXT), "top_k": 5}' | python3 -m json.tool
	@echo ""

test-linking:
	@echo ""
	@echo "--- POST /api/v1/linking (rerank candidates) ---"
	@curl -s -X POST $(BACKEND_URL)/api/v1/linking \
		-H "Content-Type: application/json" \
		-d '{ \
			"text": $(SAMPLE_TEXT), \
			"entities": [{ \
				"mention": "chest pain", \
				"entity_type": "finding", \
				"start": 22, \
				"end": 32, \
				"candidates": [ \
					{"concept_id": "29857009", "score": 0.95, "term": "Chest pain", "fsn": "Chest pain (finding)", "semantic_tag": "finding"}, \
					{"concept_id": "426396005", "score": 0.88, "term": "Cardiac chest pain", "fsn": "Cardiac chest pain (finding)", "semantic_tag": "finding"}, \
					{"concept_id": "274668005", "score": 0.82, "term": "Acute chest pain", "fsn": "Acute chest pain (finding)", "semantic_tag": "finding"} \
				] \
			}] \
		}' | python3 -m json.tool
	@echo ""

test-discussion:
	@echo ""
	@echo "--- POST /api/v1/discussion (chat) ---"
	@curl -s -X POST $(BACKEND_URL)/api/v1/discussion \
		-H "Content-Type: application/json" \
		-d '{ \
			"text": $(SAMPLE_TEXT), \
			"messages": [{"role": "user", "content": "What are the key findings in this note?"}] \
		}' | python3 -m json.tool
	@echo ""

test-hierarchy:
	@echo ""
	@echo "--- GET /api/v1/concepts/29857009/hierarchy (chest pain) ---"
	@curl -s $(BACKEND_URL)/api/v1/concepts/29857009/hierarchy | python3 -m json.tool
	@echo ""

# ---------------------------------------------------------------------------
# Agentic search (opt-in, slower)
# ---------------------------------------------------------------------------

test-extract-agentic:
	@echo ""
	@echo "--- POST /api/v1/extract (with agentic search) ---"
	@curl -s -X POST $(BACKEND_URL)/api/v1/extract \
		-H "Content-Type: application/json" \
		-d '{"text": "Patient underwent CABG and was placed on warfarin.", "top_k": 5, "agentic_search": true}' \
		| python3 -m json.tool
	@echo ""

# ---------------------------------------------------------------------------
# Docs
# ---------------------------------------------------------------------------

docs:
	@echo "Swagger UI: $(BACKEND_URL)/docs"
	@echo "ReDoc:      $(BACKEND_URL)/redoc"
	@python3 -m webbrowser $(BACKEND_URL)/docs 2>/dev/null || true
