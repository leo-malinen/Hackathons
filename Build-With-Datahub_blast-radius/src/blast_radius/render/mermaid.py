"""Mermaid lineage diagram for the PR comment.

GitHub renders mermaid natively in comments, so the reviewer sees the actual
column-level path from the changed column to the production model without
leaving the pull request.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set, Tuple

from ..context.base import BI_TYPES, ML_TYPES, PIPELINE_TYPES
from ..state import BlastRadiusState

CLASS_BY_TYPE = {
    "dataset": "ds",
    "dashboard": "bi",
    "chart": "bi",
    "dataJob": "job",
    "dataFlow": "job",
    "mlFeature": "ml",
    "mlPrimaryKey": "ml",
    "mlFeatureTable": "ml",
    "mlModel": "model",
    "mlModelDeployment": "deploy",
}

SHAPE = {
    "ds": ("[", "]"),
    "bi": ("([", "])"),
    "job": ("[/", "/]"),
    "ml": ("{{", "}}"),
    "model": ("[[", "]]"),
    "deploy": ("((", "))"),
    "changed": ("[", "]"),
}


def _node_id(urn: str, seen: Dict[str, str]) -> str:
    if urn in seen:
        return seen[urn]
    ident = "n%d" % (len(seen) + 1)
    seen[urn] = ident
    return ident


def _escape(text: str) -> str:
    return re.sub(r'["\[\]{}()<>|]', " ", str(text)).strip() or "?"


def render_mermaid(state: BlastRadiusState, max_nodes: int = 22) -> str:
    """Return a mermaid flowchart of the blast radius, or '' if nothing to draw."""
    if not state.impacted:
        return ""

    labels: Dict[str, str] = {}
    types: Dict[str, str] = {}
    changed_urns: Set[str] = set()

    for asset in state.changed_assets:
        if asset.urn:
            labels[asset.urn] = asset.name
            types[asset.urn] = "changed"
            changed_urns.add(asset.urn)

    ranked = sorted(state.impacted, key=lambda i: -i.score)
    keep: Set[str] = set(changed_urns)
    for item in ranked[:max_nodes]:
        labels[item.entity.urn] = item.entity.short_name
        types[item.entity.urn] = CLASS_BY_TYPE.get(item.entity.entity_type, "ds")
        keep.add(item.entity.urn)

    # Collect edges from the recorded paths so intermediate hops are shown.
    edges: List[Tuple[str, str, str]] = []
    seen_edges: Set[Tuple[str, str, str]] = set()
    for item in ranked[:max_nodes]:
        path = item.best_path()
        if not path:
            continue
        for edge in path.edges:
            if edge.upstream_urn not in labels:
                labels[edge.upstream_urn] = _short(edge.upstream_urn)
                types[edge.upstream_urn] = "ds"
                keep.add(edge.upstream_urn)
            if edge.downstream_urn not in labels:
                labels[edge.downstream_urn] = _short(edge.downstream_urn)
                types[edge.downstream_urn] = "ds"
                keep.add(edge.downstream_urn)
            label = ""
            if edge.upstream_column and edge.downstream_column:
                if edge.upstream_column == edge.downstream_column:
                    label = edge.upstream_column
                else:
                    label = "%s to %s" % (edge.upstream_column, edge.downstream_column)
            elif edge.downstream_column:
                label = edge.downstream_column
            elif edge.via and edge.via != "lineage":
                label = edge.via
            key = (edge.upstream_urn, edge.downstream_urn, label)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append(key)

    if not edges:
        return ""

    ids: Dict[str, str] = {}
    lines: List[str] = ["flowchart LR"]

    for urn in keep:
        kind = types.get(urn, "ds")
        open_shape, close_shape = SHAPE.get(kind, SHAPE["ds"])
        ident = _node_id(urn, ids)
        label = _escape(labels.get(urn, _short(urn)))
        if kind == "deploy":
            label = label + " (serving)"
        lines.append('    %s%s"%s"%s' % (ident, open_shape, label, close_shape))

    for upstream, downstream, label in edges[:60]:
        if upstream not in ids or downstream not in ids:
            continue
        if label:
            lines.append(
                "    %s -->|%s| %s" % (ids[upstream], _escape(label), ids[downstream])
            )
        else:
            lines.append("    %s --> %s" % (ids[upstream], ids[downstream]))

    for urn in keep:
        kind = types.get(urn, "ds")
        if urn in ids:
            lines.append("    class %s %s;" % (ids[urn], kind))

    lines.extend(
        [
            "    classDef changed fill:#ffe3e3,stroke:#b30000,stroke-width:3px,color:#111;",
            "    classDef ds fill:#f1f3f5,stroke:#868e96,color:#111;",
            "    classDef bi fill:#e7f5ff,stroke:#1c7ed6,color:#111;",
            "    classDef job fill:#fff9db,stroke:#f08c00,color:#111;",
            "    classDef ml fill:#f3f0ff,stroke:#7048e8,color:#111;",
            "    classDef model fill:#ffe8cc,stroke:#e8590c,stroke-width:3px,color:#111;",
            "    classDef deploy fill:#ffc9c9,stroke:#b30000,stroke-width:4px,color:#111;",
        ]
    )
    return "\n".join(lines)


def _short(urn: str) -> str:
    from ..context.base import pretty_urn

    return pretty_urn(urn)
