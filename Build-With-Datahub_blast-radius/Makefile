.PHONY: help install install-all demo demo-live seed props test lint clean mcp-check doctor audit

PY ?= python3

help:
	@echo "Blast Radius — pre-merge Data Change Firewall"
	@echo ""
	@echo "  make install       Install the package (minimal deps, ~20s)"
	@echo "  make install-all   Install with DataHub SDK + LangGraph"
	@echo "  make demo          Run the killer demo offline (no DataHub, no keys needed)"
	@echo "  make demo-live     Run the demo against a live DataHub instance"
	@echo "  make seed          Emit the hand-authored ML lineage slice into DataHub"
	@echo "  make props         Create the blast_radius_score structured properties"
	@echo "  make audit         Reverse mode: audit upstreams of production ML models"
	@echo "  make mcp-check     Verify the DataHub MCP server + mutation tools"
	@echo "  make doctor        Print environment / connectivity diagnostics"
	@echo "  make test          Run the test suite"
	@echo "  make lint          Ruff"

install:
	$(PY) -m pip install -e .

install-all:
	$(PY) -m pip install -e ".[all]"

demo:
	blast-radius demo

demo-live:
	blast-radius demo --context-source sdk

seed:
	$(PY) scripts/seed_datahub_ml_slice.py

props:
	$(PY) scripts/bootstrap_structured_properties.py

audit:
	blast-radius audit

mcp-check:
	blast-radius mcp-check

doctor:
	blast-radius doctor

test:
	$(PY) -m pytest

lint:
	$(PY) -m ruff check src tests scripts

clean:
	rm -rf .blast-radius build dist *.egg-info .pytest_cache .ruff_cache
	find . -name __pycache__ -type d -exec rm -rf {} +
