"""[2b] Blast Radius Agent - deterministic downstream traversal.

Seeds are (dataset URN, changed column) pairs. We walk DataHub's column-level
lineage outward, then hydrate every reached entity with owners, tier, tags,
deprecation and real query volume.

No language model is involved in this node. Ever.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from ..lineage import traverse_downstream
from ..state import ChangedAsset, ColumnChange, ImpactedAsset

log = logging.getLogger("blast_radius.traverse")


def build_seeds(assets: List[ChangedAsset]) -> List[Tuple[str, Optional[str]]]:
    """(urn, column) pairs. A file with no column-level detail seeds (urn, None)."""
    seeds: List[Tuple[str, Optional[str]]] = []
    for asset in assets:
        if not asset.urn:
            continue
        cols = [c.column for c in asset.changes if c.column]
        if cols:
            for col in dict.fromkeys(cols):
                seeds.append((asset.urn, col))
        else:
            seeds.append((asset.urn, None))
    return seeds


def changes_for_column(assets: List[ChangedAsset], urn: str, column: Optional[str]) -> List[ColumnChange]:
    out: List[ColumnChange] = []
    for asset in assets:
        if asset.urn != urn:
            continue
        for change in asset.changes:
            if column is None or change.column.lower() == column.lower():
                out.append(change)
    return out


def traverse_lineage(state, deps) -> Dict[str, Any]:
    ctx = deps.ctx
    settings = deps.settings

    seeds = build_seeds(state.changed_assets)
    if not seeds:
        return {
            "impacted": [],
            "traversal_stats": {"seeds": 0, "visited": 0, "edges": 0},
        }

    result = traverse_downstream(ctx, seeds, max_hops=settings.max_hops)

    seed_urns = {u for u, _ in seeds}
    impacted: List[ImpactedAsset] = []

    for urn, paths in result.paths_by_urn.items():
        if urn in seed_urns:
            continue  # the changed asset itself is not "impacted"
        entity = None
        try:
            entity = ctx.get_entity(urn)
        except Exception as exc:
            log.debug("get_entity failed for %s: %s", urn, exc)
        if entity is None:
            continue

        columns = sorted(result.columns_by_urn.get(urn, set()))
        hops = result.hops_by_urn.get(urn, min(p.hops for p in paths))

        # Which of our changes actually reach this asset?
        triggering: List[ColumnChange] = []
        for path in paths:
            if not path.edges:
                continue
            first = path.edges[0]
            triggering.extend(
                changes_for_column(state.changed_assets, first.upstream_urn, first.upstream_column)
            )
        # de-dupe while preserving order
        seen = set()
        deduped: List[ColumnChange] = []
        for c in triggering:
            key = (c.kind, c.asset, c.column)
            if key not in seen:
                seen.add(key)
                deduped.append(c)

        usage = _usage_for(ctx, entity, columns)

        impacted.append(
            ImpactedAsset(
                entity=entity,
                hops=hops,
                paths=paths,
                triggering_changes=deduped,
                impacted_columns=columns,
                usage=usage,
            )
        )

    # Also record usage on the changed assets themselves - "847 queries in the
    # last 30 days" is about the column being changed, not just its children.
    seed_usage: Dict[str, Any] = {}
    for urn, column in seeds:
        try:
            usage = ctx.get_dataset_queries(urn, column)
        except Exception:
            continue
        if usage.total_queries:
            seed_usage[f"{urn}::{column or '*'}"] = usage.to_dict()

    impacted.sort(key=lambda i: (i.hops, i.entity.name))

    return {
        "impacted": impacted,
        "traversal_stats": {
            "seeds": len(seeds),
            "visited": result.visited,
            "edges": result.edges_walked,
            "reached": len(impacted),
            "max_hops": settings.max_hops,
            "truncated": result.truncated,
            "seed_usage": seed_usage,
            "column_level": sum(
                1 for i in impacted if any(p.is_column_level for p in i.paths)
            ),
        },
    }


def _usage_for(ctx, entity, columns: List[str]):
    from ..context.base import QueryUsage

    if entity.entity_type != "dataset":
        return QueryUsage(total_queries=entity.query_count_30d)
    best = QueryUsage()
    try:
        best = ctx.get_dataset_queries(entity.urn)
    except Exception:
        pass
    for col in columns:
        try:
            col_usage = ctx.get_dataset_queries(entity.urn, col)
        except Exception:
            continue
        if col_usage.total_queries > best.total_queries:
            best = col_usage
    if not best.total_queries and entity.query_count_30d:
        best = QueryUsage(total_queries=entity.query_count_30d)
    return best
