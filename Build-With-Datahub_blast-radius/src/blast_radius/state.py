"""The pipeline state object passed between agents."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .context.base import Entity, LineagePath, QueryUsage, WritebackRecord

# Change kinds, ordered by how dangerous they are.
BREAKING_KINDS = {"drop", "rename", "type_change", "nullability"}


@dataclass
class ColumnChange:
    kind: str  # drop | rename | type_change | nullability | add | expression_change
    asset: str  # logical asset name, e.g. stg_user_transactions
    column: str
    new_column: Optional[str] = None
    old_type: Optional[str] = None
    new_type: Optional[str] = None
    old_expression: str = ""
    new_expression: str = ""
    detail: str = ""

    @property
    def is_breaking(self) -> bool:
        return self.kind in BREAKING_KINDS

    def describe(self) -> str:
        if self.kind == "rename":
            return f"`{self.column}` renamed to `{self.new_column}`"
        if self.kind == "drop":
            return f"`{self.column}` dropped"
        if self.kind == "type_change":
            return f"`{self.column}` retyped {self.old_type} -> {self.new_type}"
        if self.kind == "nullability":
            return f"`{self.column}` nullability changed"
        if self.kind == "add":
            return f"`{self.column}` added"
        if self.kind == "expression_change":
            return f"`{self.column}` logic changed"
        return f"`{self.column}` {self.kind}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind,
            "asset": self.asset,
            "column": self.column,
            "new_column": self.new_column,
            "old_type": self.old_type,
            "new_type": self.new_type,
            "old_expression": self.old_expression,
            "new_expression": self.new_expression,
            "detail": self.detail,
            "breaking": self.is_breaking,
        }


@dataclass
class ChangedAsset:
    """One changed file, parsed structurally."""

    path: str
    asset_type: str  # dbt_model | dbt_contract | airflow_dag | feature_def | ingestion_config | unknown
    name: str
    status: str = "modified"  # added | modified | deleted | renamed
    changes: List[ColumnChange] = field(default_factory=list)
    urn: Optional[str] = None
    urn_confidence: str = "unresolved"  # override | search | convention | unresolved
    notes: List[str] = field(default_factory=list)

    @property
    def breaking_changes(self) -> List[ColumnChange]:
        return [c for c in self.changes if c.is_breaking]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "asset_type": self.asset_type,
            "name": self.name,
            "status": self.status,
            "urn": self.urn,
            "urn_confidence": self.urn_confidence,
            "changes": [c.to_dict() for c in self.changes],
            "notes": list(self.notes),
        }


@dataclass
class ImpactedAsset:
    """A downstream entity reached by a change, with the exact path taken."""

    entity: Entity
    hops: int
    paths: List[LineagePath] = field(default_factory=list)
    triggering_changes: List[ColumnChange] = field(default_factory=list)
    impacted_columns: List[str] = field(default_factory=list)
    usage: QueryUsage = field(default_factory=QueryUsage)
    score: float = 0.0
    reasons: List[str] = field(default_factory=list)

    @property
    def urn(self) -> str:
        return self.entity.urn

    def best_path(self) -> Optional[LineagePath]:
        if not self.paths:
            return None
        return sorted(self.paths, key=lambda p: (not p.is_column_level, p.hops))[0]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity": self.entity.to_dict(),
            "hops": self.hops,
            "score": round(self.score, 2),
            "impacted_columns": list(self.impacted_columns),
            "usage": self.usage.to_dict(),
            "reasons": list(self.reasons),
            "paths": [p.to_dict() for p in self.paths[:3]],
        }


@dataclass
class GeneratedArtifact:
    """A file the Remediation Agent produced."""

    path: str
    language: str
    purpose: str
    content: str
    generated_by: str = "template"  # template | llm | llm+template
    for_asset: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "language": self.language,
            "purpose": self.purpose,
            "generated_by": self.generated_by,
            "for_asset": self.for_asset,
            "bytes": len(self.content),
        }


@dataclass
class BlastRadiusState:
    """Shared state for the LangGraph pipeline.

    Nodes return dicts of field updates; both the LangGraph runner and the
    built-in sequential runner merge them the same way.
    """

    # inputs
    base_ref: str = ""
    head_ref: str = "HEAD"
    simulate: List[str] = field(default_factory=list)

    # [1] parse_diff
    changed_assets: List[ChangedAsset] = field(default_factory=list)

    # [2] resolve_urns / traverse
    seed_urns: List[str] = field(default_factory=list)
    impacted: List[ImpactedAsset] = field(default_factory=list)
    traversal_stats: Dict[str, Any] = field(default_factory=dict)

    # [3] ml_risk
    severity: str = "NONE"
    score: float = 0.0
    ml_assets: List[ImpactedAsset] = field(default_factory=list)
    narrative: str = ""
    headline: str = ""
    monthly_cost_at_risk: float = 0.0

    # [4] remediate
    artifacts: List[GeneratedArtifact] = field(default_factory=list)

    # [5] writeback
    writebacks: List[WritebackRecord] = field(default_factory=list)
    document_url: Optional[str] = None

    # outputs
    comment_markdown: str = ""
    context_source: str = ""
    errors: List[str] = field(default_factory=list)
    timings: Dict[str, float] = field(default_factory=dict)

    # ------------------------------------------------------------------
    @property
    def all_changes(self) -> List[ColumnChange]:
        out: List[ColumnChange] = []
        for a in self.changed_assets:
            out.extend(a.changes)
        return out

    @property
    def breaking_changes(self) -> List[ColumnChange]:
        return [c for c in self.all_changes if c.is_breaking]

    def impacted_of_type(self, *types: str) -> List[ImpactedAsset]:
        wanted = set(types)
        return [i for i in self.impacted if i.entity.entity_type in wanted]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "severity": self.severity,
            "score": round(self.score, 2),
            "headline": self.headline,
            "narrative": self.narrative,
            "context_source": self.context_source,
            "monthly_cost_at_risk": round(self.monthly_cost_at_risk, 2),
            "changed_assets": [a.to_dict() for a in self.changed_assets],
            "impacted": [i.to_dict() for i in self.impacted],
            "artifacts": [a.to_dict() for a in self.artifacts],
            "writebacks": [w.to_dict() for w in self.writebacks],
            "document_url": self.document_url,
            "traversal": self.traversal_stats,
            "errors": list(self.errors),
            "timings": {k: round(v, 3) for k, v in self.timings.items()},
        }
