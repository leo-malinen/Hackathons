"""Deterministic downstream traversal.

This module is the heart of the firewall and it contains ZERO language model
calls, on purpose. An LLM asked to "walk the lineage" will hallucinate a hop on
stage. A breadth-first search over metadata will not.

Column awareness: when an edge carries a fine-grained (column -> column)
mapping, we only follow it if the upstream column is one we actually changed,
and we carry the *renamed* column forward. When an edge is table-level only, we
follow it but mark the path as coarse so the PR comment can be honest about
confidence.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from .context.base import DataHubContext, LineageEdge, LineagePath


@dataclass
class Frontier:
    urn: str
    column: Optional[str]
    path: LineagePath

    @property
    def key(self) -> Tuple[str, Optional[str]]:
        return (self.urn, (self.column or "").lower() or None)


@dataclass
class TraversalResult:
    # urn -> list of distinct paths that reach it
    paths_by_urn: Dict[str, List[LineagePath]]
    # urn -> set of impacted column names at that asset
    columns_by_urn: Dict[str, Set[str]]
    # urn -> shortest hop count
    hops_by_urn: Dict[str, int]
    visited: int = 0
    edges_walked: int = 0
    truncated: bool = False


def traverse_downstream(
    ctx: DataHubContext,
    seeds: Sequence[Tuple[str, Optional[str]]],
    max_hops: int = 6,
    max_nodes: int = 4000,
    max_paths_per_node: int = 4,
) -> TraversalResult:
    """BFS from (urn, column) seeds.

    A seed column of None means "the whole asset changed", which follows every
    downstream edge regardless of column mapping.
    """
    paths_by_urn: Dict[str, List[LineagePath]] = {}
    columns_by_urn: Dict[str, Set[str]] = {}
    hops_by_urn: Dict[str, int] = {}

    seen: Set[Tuple[str, Optional[str]]] = set()
    edge_cache: Dict[str, List[LineageEdge]] = {}
    queue: deque = deque()

    for urn, column in seeds:
        f = Frontier(urn=urn, column=column, path=LineagePath())
        if f.key in seen:
            continue
        seen.add(f.key)
        queue.append(f)

    visited = 0
    edges_walked = 0
    truncated = False

    while queue:
        current = queue.popleft()
        visited += 1
        if visited > max_nodes:
            truncated = True
            break
        if current.path.hops >= max_hops:
            continue

        if current.urn not in edge_cache:
            try:
                edge_cache[current.urn] = ctx.get_downstream_edges(current.urn)
            except Exception:
                edge_cache[current.urn] = []
        edges = edge_cache[current.urn]

        # Does this node publish any column-level mapping at all?
        has_column_edges = any(e.is_column_level for e in edges)

        for edge in edges:
            edges_walked += 1
            next_column = _next_column(current, edge, has_column_edges)
            if next_column is _SKIP:
                continue

            new_path = LineagePath(edges=list(current.path.edges) + [edge])
            down = edge.downstream_urn

            bucket = paths_by_urn.setdefault(down, [])
            if len(bucket) < max_paths_per_node:
                bucket.append(new_path)
            prior = hops_by_urn.get(down)
            if prior is None or new_path.hops < prior:
                hops_by_urn[down] = new_path.hops
            if next_column:
                columns_by_urn.setdefault(down, set()).add(next_column)

            nxt = Frontier(urn=down, column=next_column, path=new_path)
            if nxt.key in seen:
                continue
            seen.add(nxt.key)
            queue.append(nxt)

    return TraversalResult(
        paths_by_urn=paths_by_urn,
        columns_by_urn=columns_by_urn,
        hops_by_urn=hops_by_urn,
        visited=visited,
        edges_walked=edges_walked,
        truncated=truncated,
    )


class _Skip:
    """Sentinel: this edge is not reachable from the column we are tracking."""

    def __repr__(self) -> str:  # pragma: no cover
        return "<skip>"


_SKIP = _Skip()


def _next_column(current: Frontier, edge: LineageEdge, node_has_column_edges: bool):
    """Decide whether to follow `edge`, and which column we land on."""
    # Asset-level change: follow everything.
    if current.column is None:
        return edge.downstream_column

    if edge.is_column_level:
        if (edge.upstream_column or "").lower() == current.column.lower():
            return edge.downstream_column
        return _SKIP

    # Table-level edge. If the node also publishes column-level edges, a
    # table-level edge is redundant noise -> skip it. If it does not, we have
    # no choice but to follow it conservatively (better a false positive in the
    # report than a production model silently poisoned).
    if node_has_column_edges and edge.via in ("lineage", "fineGrained"):
        return _SKIP
    return current.column


def paths_between(
    ctx: DataHubContext,
    source_urn: str,
    target_urn: str,
    source_column: Optional[str] = None,
    max_hops: int = 8,
) -> List[LineagePath]:
    """Equivalent of DataHub's get_lineage_paths_between, computed locally.

    Used to render the exact chain (including transform SQL) for the headline
    ML model in the PR comment.
    """
    result = traverse_downstream(
        ctx, [(source_urn, source_column)], max_hops=max_hops, max_paths_per_node=8
    )
    return result.paths_by_urn.get(target_urn, [])


def describe_path(path: LineagePath, label_fn) -> str:
    """Render a path as `a.col --transform--> b.col --> c`."""
    if not path.edges:
        return ""
    first = path.edges[0]
    parts = [_node_label(first.upstream_urn, first.upstream_column, label_fn)]
    for edge in path.edges:
        arrow = f" --[{_trim(edge.transform)}]--> " if edge.transform else " --> "
        parts.append(arrow)
        parts.append(_node_label(edge.downstream_urn, edge.downstream_column, label_fn))
    return "".join(parts)


def _node_label(urn: str, column: Optional[str], label_fn) -> str:
    base = label_fn(urn)
    return f"{base}.{column}" if column else base


def _trim(text: str, limit: int = 60) -> str:
    flat = " ".join((text or "").split())
    return flat[:limit] + ("..." if len(flat) > limit else "")


def collect_upstream_risks(ctx: DataHubContext, urn: str, max_hops: int = 4) -> List[dict]:
    """Reverse mode: walk UP from a production model and flag weak upstreams.

    Same engine, opposite direction. Powers `blast-radius audit`.
    """
    findings: List[dict] = []
    seen: Set[str] = {urn}
    queue: deque = deque([(urn, 0)])

    while queue:
        node, depth = queue.popleft()
        if depth >= max_hops:
            continue
        try:
            edges = ctx.get_upstream_edges(node)
        except Exception:
            edges = []
        for edge in edges:
            up = edge.upstream_urn
            if up in seen:
                continue
            seen.add(up)
            queue.append((up, depth + 1))

            entity = ctx.get_entity(up)
            if entity is None:
                continue
            problems = []
            if not entity.owners:
                problems.append("no owner")
            if entity.deprecated:
                problems.append("deprecated")
            if not entity.description:
                problems.append("undocumented")
            if entity.entity_type == "dataset" and not entity.schema_fields:
                problems.append("no catalogued schema")
            if problems:
                findings.append(
                    {
                        "urn": up,
                        "name": entity.name,
                        "type": entity.entity_type,
                        "hops": depth + 1,
                        "problems": problems,
                    }
                )
    return findings


def iter_edges(result: TraversalResult) -> Iterable[LineageEdge]:
    for paths in result.paths_by_urn.values():
        for path in paths:
            yield from path.edges
