"""Core metadata types + the DataHubContext interface.

Every access path (SDK/GraphQL, MCP stdio server, offline fixture) implements
the same small interface, so the agent pipeline is completely decoupled from
*how* we reach DataHub. That is what lets the exact same code run:

  * in a GitHub Action  -> SdkContext
  * in your editor      -> McpContext
  * on a plane          -> FixtureContext
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

# --------------------------------------------------------------------------
# Entity type groupings (DataHub entity type names, as returned by GraphQL)
# --------------------------------------------------------------------------
DATASET_TYPES = {"dataset"}
ML_TYPES = {
    "mlFeature",
    "mlPrimaryKey",
    "mlFeatureTable",
    "mlModel",
    "mlModelGroup",
    "mlModelDeployment",
}
BI_TYPES = {"dashboard", "chart"}
PIPELINE_TYPES = {"dataJob", "dataFlow"}

ENTITY_ICON = {
    "dataset": "\U0001f5c3\ufe0f",
    "dashboard": "\U0001f4ca",
    "chart": "\U0001f4c8",
    "dataJob": "\u2699\ufe0f",
    "dataFlow": "\U0001f501",
    "mlFeature": "\U0001f9ec",
    "mlPrimaryKey": "\U0001f511",
    "mlFeatureTable": "\U0001f9f0",
    "mlModel": "\U0001f916",
    "mlModelGroup": "\U0001f9e0",
    "mlModelDeployment": "\U0001f6a8",
}


def icon_for(entity_type: str) -> str:
    return ENTITY_ICON.get(entity_type, "\U0001f4e6")


# --------------------------------------------------------------------------
# Value objects
# --------------------------------------------------------------------------
@dataclass
class SchemaField:
    """A single column, as catalogued by DataHub.

    Generated remediation code is grounded in these - never in column names the
    model invented. That is the whole 'works on the first try' thesis.
    """

    name: str
    type: str = "unknown"
    native_type: str = ""
    nullable: bool = True
    description: str = ""
    tags: List[str] = field(default_factory=list)
    is_primary_key: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "native_type": self.native_type or self.type,
            "nullable": self.nullable,
            "description": self.description,
        }


@dataclass
class Entity:
    """Any node in the DataHub graph that a change can reach."""

    urn: str
    entity_type: str
    name: str
    platform: Optional[str] = None
    tier: Optional[str] = None
    domain: Optional[str] = None
    description: str = ""
    owners: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    glossary_terms: List[str] = field(default_factory=list)
    deprecated: bool = False
    certified: bool = False
    schema_fields: List[SchemaField] = field(default_factory=list)
    query_count_30d: int = 0
    monthly_cost_usd: float = 0.0
    external_url: Optional[str] = None
    properties: Dict[str, Any] = field(default_factory=dict)

    # -- derived helpers ---------------------------------------------------
    @property
    def short_name(self) -> str:
        base = self.name.split(",")[0]
        return base.split(".")[-1]

    @property
    def is_ml(self) -> bool:
        return self.entity_type in ML_TYPES

    @property
    def is_bi(self) -> bool:
        return self.entity_type in BI_TYPES

    @property
    def is_pipeline(self) -> bool:
        return self.entity_type in PIPELINE_TYPES

    @property
    def is_serving(self) -> bool:
        """True for a model deployment that is actually taking live traffic."""
        if self.entity_type != "mlModelDeployment":
            return False
        status = str(self.properties.get("status", "")).upper()
        if status in {"OUT_OF_SERVICE", "CREATING", "FAILED", "DELETING"}:
            return False
        return bool(self.properties.get("requests_per_day", 0)) or status == "IN_SERVICE"

    @property
    def requests_per_day(self) -> int:
        try:
            return int(self.properties.get("requests_per_day", 0) or 0)
        except (TypeError, ValueError):
            return 0

    def field_named(self, column: str) -> Optional[SchemaField]:
        target = (column or "").lower()
        for f in self.schema_fields:
            if f.name.lower() == target:
                return f
        return None

    def icon(self) -> str:
        return icon_for(self.entity_type)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "urn": self.urn,
            "type": self.entity_type,
            "name": self.name,
            "platform": self.platform,
            "tier": self.tier,
            "domain": self.domain,
            "owners": list(self.owners),
            "tags": list(self.tags),
            "deprecated": self.deprecated,
            "certified": self.certified,
            "query_count_30d": self.query_count_30d,
            "monthly_cost_usd": self.monthly_cost_usd,
            "properties": dict(self.properties),
        }


@dataclass
class LineageEdge:
    """One hop. Column-level when DataHub knows the fine-grained mapping."""

    upstream_urn: str
    downstream_urn: str
    upstream_column: Optional[str] = None
    downstream_column: Optional[str] = None
    transform: str = ""
    confidence: float = 1.0
    via: str = "lineage"  # lineage | fineGrained | mlFeatureSource | mlModelFeature | consumes

    @property
    def is_column_level(self) -> bool:
        return bool(self.upstream_column and self.downstream_column)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "upstream": self.upstream_urn,
            "downstream": self.downstream_urn,
            "upstream_column": self.upstream_column,
            "downstream_column": self.downstream_column,
            "transform": self.transform,
            "via": self.via,
        }


@dataclass
class LineagePath:
    """An ordered chain of edges from the changed column to an impacted asset."""

    edges: List[LineageEdge] = field(default_factory=list)

    @property
    def hops(self) -> int:
        return len(self.edges)

    @property
    def is_column_level(self) -> bool:
        return all(e.is_column_level for e in self.edges) and bool(self.edges)

    def terminal_column(self) -> Optional[str]:
        for edge in reversed(self.edges):
            if edge.downstream_column:
                return edge.downstream_column
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {"hops": self.hops, "edges": [e.to_dict() for e in self.edges]}


@dataclass
class QueryUsage:
    """Real-world usage, from DataHub's query/usage aspects.

    'This column appears in 847 queries in the last 30 days' is a far more
    credible severity signal than counting lineage edges.
    """

    total_queries: int = 0
    distinct_users: int = 0
    window_days: int = 30
    top_queries: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_queries": self.total_queries,
            "distinct_users": self.distinct_users,
            "window_days": self.window_days,
        }


@dataclass
class WritebackRecord:
    """Receipt for one mutation we performed (or proposed) against DataHub."""

    action: str
    target: str
    detail: str = ""
    ok: bool = True
    proposed: bool = False
    url: Optional[str] = None
    error: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "target": self.target,
            "detail": self.detail,
            "ok": self.ok,
            "proposed": self.proposed,
            "url": self.url,
            "error": self.error,
        }


# --------------------------------------------------------------------------
# URN helpers
# --------------------------------------------------------------------------
_DATASET_URN_RE = re.compile(r"^urn:li:dataset:\(urn:li:dataPlatform:([^,]+),(.+),([^,]+)\)$")


def urn_entity_type(urn: str) -> str:
    parts = urn.split(":")
    return parts[2] if len(parts) > 2 else "unknown"


def parse_dataset_urn(urn: str):
    """-> (platform, name, env) or None."""
    m = _DATASET_URN_RE.match(urn)
    if not m:
        return None
    return m.group(1), m.group(2), m.group(3)


def make_dataset_urn(platform: str, name: str, env: str = "PROD") -> str:
    return f"urn:li:dataset:(urn:li:dataPlatform:{platform},{name},{env})"


def make_schema_field_urn(dataset_urn: str, column: str) -> str:
    return f"urn:li:schemaField:({dataset_urn},{column})"


def pretty_urn(urn: str) -> str:
    """Human-friendly short label for an URN, for PR comments and mermaid."""
    ds = parse_dataset_urn(urn)
    if ds:
        return ds[1]
    inner = urn
    if urn.startswith("urn:li:"):
        rest = urn[len("urn:li:") :]
        _, _, tail = rest.partition(":")
        inner = tail.strip("()")
    inner = inner.replace("urn:li:dataPlatform:", "")
    inner = re.sub(r"urn:li:dataFlow:\(([^)]*)\)", r"\1", inner)
    return inner.strip("()")


# --------------------------------------------------------------------------
# The interface
# --------------------------------------------------------------------------
class DataHubContext:
    """Read + mutate the DataHub context graph.

    Read side mirrors the DataHub agent tool surface:
        search / get_entities / get_lineage / get_lineage_paths_between /
        get_dataset_queries / list_schema_fields

    Write side mirrors the mutation + governance tools:
        add_tags / update_description / add_structured_properties /
        save_document / propose_lifecycle_stage / list_pending_proposals
    """

    name = "base"
    supports_mutations = False

    # -- description -------------------------------------------------------
    def describe(self) -> str:
        return self.name

    def health(self) -> Dict[str, Any]:
        return {"source": self.name, "ok": True, "mutations": self.supports_mutations}

    # -- read --------------------------------------------------------------
    def search(
        self,
        query: str,
        entity_types: Optional[Sequence[str]] = None,
        platform: Optional[str] = None,
        limit: int = 10,
    ) -> List[Entity]:
        raise NotImplementedError

    def get_entity(self, urn: str) -> Optional[Entity]:
        raise NotImplementedError

    def get_entities(self, urns: Sequence[str]) -> List[Entity]:
        out = []
        for u in urns:
            e = self.get_entity(u)
            if e is not None:
                out.append(e)
        return out

    def list_schema_fields(self, urn: str) -> List[SchemaField]:
        e = self.get_entity(urn)
        return list(e.schema_fields) if e else []

    def get_downstream_edges(self, urn: str) -> List[LineageEdge]:
        """One hop downstream. Column-level whenever DataHub knows it."""
        raise NotImplementedError

    def get_upstream_edges(self, urn: str) -> List[LineageEdge]:
        raise NotImplementedError

    def get_dataset_queries(self, urn: str, column: Optional[str] = None) -> QueryUsage:
        return QueryUsage()

    def list_prod_ml_models(self) -> List[Entity]:
        return self.search("*", entity_types=["mlModel"], limit=200)

    # -- write -------------------------------------------------------------
    def add_tags(self, urn: str, tags: Sequence[str]) -> WritebackRecord:
        return WritebackRecord("add_tags", urn, ok=False, error="unsupported")

    def update_description(
        self, urn: str, description: str, column: Optional[str] = None
    ) -> WritebackRecord:
        return WritebackRecord("update_description", urn, ok=False, error="unsupported")

    def add_structured_properties(
        self, urn: str, properties: Dict[str, Any]
    ) -> WritebackRecord:
        return WritebackRecord("add_structured_properties", urn, ok=False, error="unsupported")

    def save_document(
        self, title: str, content: str, related_urns: Sequence[str] = ()
    ) -> WritebackRecord:
        return WritebackRecord("save_document", title, ok=False, error="unsupported")

    def propose_lifecycle_stage(
        self, urn: str, stage: str, note: str = "", column: Optional[str] = None
    ) -> WritebackRecord:
        return WritebackRecord("propose_lifecycle_stage", urn, ok=False, error="unsupported")

    def list_pending_proposals(self, limit: int = 25) -> List[Dict[str, Any]]:
        return []

    # -- convenience -------------------------------------------------------
    def entity_url(self, urn: str) -> Optional[str]:
        return None
