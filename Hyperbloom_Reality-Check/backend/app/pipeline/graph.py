"""Evidence graph construction (PRD section 17).

Turns a finished investigation into nodes and edges the frontend lays out.
The graph is the visible answer to "why did you conclude that", so it shows
the real structure of the reasoning rather than a decorative fan of links:

  input -> claim -> stance bucket -> evidence -> analysis -> verdict

Duplicate sources collapse behind a cluster node, which is what makes the
"3 articles are not 3 sources" point legible at a glance.
"""
from __future__ import annotations

from ..schemas import (
    Claim,
    Evidence,
    EvidenceGraph,
    GraphEdge,
    GraphNode,
    Relationship,
    SourceCluster,
    Verdict,
)

# Every non-irrelevant stance gets a bucket. Omitting INCONCLUSIVE would hide
# on-topic sources that simply did not settle the question, and a graph that
# silently drops most of the evidence misrepresents the investigation, which is
# the one thing this picture exists to prevent.
_BUCKETS: list[tuple[Relationship, str, str]] = [
    (Relationship.SUPPORTS, "supports", "Supporting"),
    (Relationship.CONTRADICTS, "contradicts", "Contradicting"),
    (Relationship.CONTEXTUALIZES, "context", "Context"),
    (Relationship.INCONCLUSIVE, "inconclusive", "Did not settle it"),
]


def build_graph(
    *,
    input_text: str,
    claims: list[Claim],
    evidence: list[Evidence],
    clusters: list[SourceCluster],
    verdict: Verdict,
    confidence: float,
) -> EvidenceGraph:
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    def add_edge(source: str, target: str, kind: str = "flow", label: str = "") -> None:
        edges.append(
            GraphEdge(
                id=f"e_{source}__{target}",
                source=source,
                target=target,
                kind=kind,  # type: ignore[arg-type]
                label=label,
            )
        )

    # --- input -----------------------------------------------------------
    preview = " ".join(input_text.split())
    nodes.append(
        GraphNode(
            id="input",
            type="input",
            label=preview[:90] + ("..." if len(preview) > 90 else ""),
            data={"full": preview[:600]},
        )
    )

    cluster_by_id = {c.id: c for c in clusters}
    multi_clusters = {c.id for c in clusters if len(c.member_ids) > 1}
    rendered_clusters: set[str] = set()

    checked = [c for c in claims if c.verdict is not None]
    for claim in checked:
        claim_node = f"claim_{claim.id}"
        nodes.append(
            GraphNode(
                id=claim_node,
                type="claim",
                label=claim.text[:110] + ("..." if len(claim.text) > 110 else ""),
                data={
                    "verdict": claim.verdict.value if claim.verdict else None,
                    "confidence": claim.confidence,
                    "type": claim.type.value,
                    "checkworthiness": claim.checkworthiness,
                    "full": claim.text,
                },
            )
        )
        add_edge("input", claim_node, "derives", "extracted")

        claim_evidence = [
            e for e in evidence
            if e.claim_id == claim.id and e.relationship is not Relationship.IRRELEVANT
        ]

        for relationship, kind, label in _BUCKETS:
            members = [e for e in claim_evidence if e.relationship is relationship]
            if not members:
                continue

            bucket_node = f"bucket_{kind}_{claim.id}"
            nodes.append(
                GraphNode(
                    id=bucket_node,
                    type="bucket",
                    label=f"{label} ({len(members)})",
                    data={"kind": kind, "count": len(members)},
                )
            )
            add_edge(claim_node, bucket_node, kind)  # type: ignore[arg-type]

            for item in members:
                parent = bucket_node

                # Collapse a duplicate chain behind one cluster node.
                if item.cluster_id in multi_clusters:
                    cluster_node = f"cluster_{item.cluster_id}"
                    if item.cluster_id not in rendered_clusters:
                        cluster = cluster_by_id[item.cluster_id]
                        nodes.append(
                            GraphNode(
                                id=cluster_node,
                                type="cluster",
                                label=(
                                    f"{len(cluster.member_ids)} sources, one origin"
                                ),
                                data={
                                    "reason": cluster.reason,
                                    "size": len(cluster.member_ids),
                                    "traces_to": cluster.traces_to,
                                },
                            )
                        )
                        rendered_clusters.add(item.cluster_id)
                        add_edge(bucket_node, cluster_node, kind)  # type: ignore[arg-type]
                    parent = cluster_node

                evidence_node = f"ev_{item.id}"
                nodes.append(
                    GraphNode(
                        id=evidence_node,
                        type="evidence",
                        label=item.title[:80] + ("..." if len(item.title) > 80 else ""),
                        data={
                            "url": item.url,
                            "publisher": item.publisher,
                            "published_at": item.published_at,
                            "quality": item.quality_score,
                            "relevance": item.relevance_score,
                            "relationship": item.relationship.value,
                            "tier": item.tier.value,
                            "why": item.why_it_matters,
                            "quote": item.key_quote,
                            "peer_reviewed": item.is_peer_reviewed,
                            "cited_by": item.cited_by_count,
                            "found_by": item.found_by,
                            "representative": item.is_cluster_representative,
                            "flagged": item.injection_flagged,
                            "evidence_id": item.id,
                        },
                    )
                )
                add_edge(parent, evidence_node, kind)  # type: ignore[arg-type]

    # --- analysis and verdict -------------------------------------------
    nodes.append(
        GraphNode(
            id="analysis",
            type="analysis",
            label="Evidence analysis",
            data={
                "evidence_count": len(evidence),
                "independent_groups": len(clusters),
                "duplicate_chains": sum(1 for c in clusters if len(c.member_ids) > 1),
            },
        )
    )
    for claim in checked:
        add_edge(f"claim_{claim.id}", "analysis", "flow", "weighed")

    nodes.append(
        GraphNode(
            id="verdict",
            type="verdict",
            label=verdict.value.replace("_", " "),
            data={"verdict": verdict.value, "confidence": confidence},
        )
    )
    add_edge("analysis", "verdict", "flow")

    return EvidenceGraph(nodes=nodes, edges=edges)
