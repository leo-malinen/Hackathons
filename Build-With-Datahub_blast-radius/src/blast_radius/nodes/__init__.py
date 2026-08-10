"""The five agents, as LangGraph nodes.

Every node has the same signature - (state, deps) -> dict of state updates -
so the sequential runner and the LangGraph runner are interchangeable.

  [1] parse_diff      structural diff via sqlglot AST. No LLM.
  [2a] resolve_urns   file path -> DataHub URN, cached. No LLM.
  [2b] traverse       deterministic column-level BFS. No LLM.
  [3] ml_risk         rule-based severity; LLM writes the narrative only.
  [4] remediate       templates grounded in list_schema_fields; LLM refines.
  [5] writeback       documents, structured properties, tags, proposals.
"""

from .ml_risk import score_ml_risk
from .parse_diff import parse_diff
from .remediate import remediate
from .resolve_urns import resolve_urns
from .traverse import traverse_lineage
from .writeback import writeback

# Short aliases used by the graph wiring.
ml_risk = score_ml_risk
traverse = traverse_lineage
generate_fix = remediate
write_to_datahub = writeback

__all__ = [
    "parse_diff",
    "resolve_urns",
    "traverse",
    "traverse_lineage",
    "ml_risk",
    "score_ml_risk",
    "remediate",
    "generate_fix",
    "writeback",
    "write_to_datahub",
]
