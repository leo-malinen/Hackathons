"""Source independence detection (PRD section 16).

Ten articles repeating one study are not ten pieces of evidence. This module
groups retrieved documents into clusters that trace back to the same origin,
so the verdict engine can weight a cluster once instead of once per copy.

Merge signals, strongest first:

  same_work          identical DOI, or identical normalised URL
  citation_chain     one document appears in another's reference list, so the
                     second is downstream of the first
  shared_references  their reference lists overlap heavily, meaning both are
                     drawing on the same underlying literature
  duplicate_title    near-identical titles, the signature of syndicated copy
  same_publisher     same registrable domain, which is correlated reporting
                     rather than independent confirmation

Union-find keeps the merges transitive: if A and B share an origin and B and
C share an origin, all three land in one cluster.
"""
from __future__ import annotations

import re
from collections import defaultdict

from ..retrieval.base import normalise_url, registrable_domain
from ..schemas import RetrievedDoc, SourceCluster

_STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "in", "on", "for", "to", "with",
    "is", "are", "was", "were", "be", "by", "at", "from", "as", "that",
    "this", "it", "its", "study", "new", "how", "why", "what",
}
_WORD = re.compile(r"[a-z0-9]+")

# A publisher-level merge is a softer claim than a shared-origin merge, so it
# only fires when neither document is primary research.
_PRIMARY_PROVIDERS = {"openalex", "europepmc", "crossref"}


class _UnionFind:
    def __init__(self, items: list[str]) -> None:
        self.parent = {item: item for item in items}

    def find(self, item: str) -> str:
        root = item
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[item] != root:  # path compression
            self.parent[item], item = root, self.parent[item]
        return root

    def union(self, a: str, b: str) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        self.parent[rb] = ra
        return True


def _title_tokens(title: str) -> frozenset[str]:
    return frozenset(
        w for w in _WORD.findall((title or "").lower())
        if w not in _STOPWORDS and len(w) > 2
    )


def _jaccard(a: frozenset[str] | set[str], b: frozenset[str] | set[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def cluster_sources(
    docs: list[RetrievedDoc],
    *,
    title_threshold: float = 0.80,
    # Papers in one field legitimately share citations, so this bar sits high
    # enough that only genuinely derivative work merges.
    reference_threshold: float = 0.62,
    min_references: int = 12,
) -> tuple[list[SourceCluster], dict[str, str]]:
    """Group ``docs`` by shared origin.

    Returns the clusters and a mapping of ``doc.id -> cluster.id``.
    """
    if not docs:
        return [], {}

    ids = [d.id for d in docs]
    by_id = {d.id: d for d in docs}
    uf = _UnionFind(ids)
    reasons: dict[tuple[str, str], str] = {}

    def merge(a: str, b: str, reason: str) -> None:
        if uf.union(a, b):
            reasons[(uf.find(a), b)] = reason

    # --- exact identity ---------------------------------------------------
    by_doi: dict[str, str] = {}
    by_url: dict[str, str] = {}
    for doc in docs:
        if doc.doi:
            key = doc.doi.lower().strip()
            if key in by_doi:
                merge(by_doi[key], doc.id, "same_work")
            else:
                by_doi[key] = doc.id
        url_key = normalise_url(doc.url)
        if url_key:
            if url_key in by_url:
                merge(by_url[url_key], doc.id, "same_work")
            else:
                by_url[url_key] = doc.id

    # --- citation chains --------------------------------------------------
    openalex_index = {d.openalex_id: d.id for d in docs if d.openalex_id}
    for doc in docs:
        for referenced in doc.referenced_works:
            cited_id = openalex_index.get(referenced)
            if cited_id and cited_id != doc.id:
                merge(cited_id, doc.id, "citation_chain")

    # --- shared reference lists -------------------------------------------
    ref_sets = {
        d.id: set(d.referenced_works)
        for d in docs
        if len(d.referenced_works) >= min_references
    }
    ref_ids = list(ref_sets)
    for i, a in enumerate(ref_ids):
        for b in ref_ids[i + 1 :]:
            if _jaccard(ref_sets[a], ref_sets[b]) >= reference_threshold:
                merge(a, b, "shared_references")

    # --- syndicated titles ------------------------------------------------
    titles = {d.id: _title_tokens(d.title) for d in docs}
    for i, a in enumerate(ids):
        if len(titles[a]) < 4:
            continue
        for b in ids[i + 1 :]:
            if len(titles[b]) < 4:
                continue
            if _jaccard(titles[a], titles[b]) >= title_threshold:
                merge(a, b, "duplicate_title")

    # --- same publisher ---------------------------------------------------
    by_domain: dict[str, list[str]] = defaultdict(list)
    for doc in docs:
        domain = registrable_domain(doc.url)
        if domain and doc.provider not in _PRIMARY_PROVIDERS:
            by_domain[domain].append(doc.id)
    for domain, members in by_domain.items():
        for other in members[1:]:
            merge(members[0], other, "same_publisher")

    # --- materialise clusters ---------------------------------------------
    grouped: dict[str, list[str]] = defaultdict(list)
    for doc_id in ids:
        grouped[uf.find(doc_id)].append(doc_id)

    clusters: list[SourceCluster] = []
    assignment: dict[str, str] = {}
    for index, (root, members) in enumerate(sorted(grouped.items()), start=1):
        cluster_id = f"cluster_{index}"
        representative = max(members, key=lambda m: _representative_rank(by_id[m]))

        reason = "independent"
        if len(members) > 1:
            found = [r for (root_key, _), r in reasons.items() if root_key == root]
            reason = found[0] if found else "same_origin"

        traces_to = None
        if len(members) > 1:
            rep = by_id[representative]
            traces_to = rep.doi or rep.title[:120] or None

        clusters.append(
            SourceCluster(
                id=cluster_id,
                reason=reason,
                member_ids=members,
                representative_id=representative,
                traces_to=traces_to,
            )
        )
        for member in members:
            assignment[member] = cluster_id

    return clusters, assignment


def _representative_rank(doc: RetrievedDoc) -> tuple[int, int, int]:
    """Prefer primary, peer-reviewed, well-cited documents as the face of a cluster."""
    return (
        1 if doc.provider in _PRIMARY_PROVIDERS else 0,
        1 if doc.is_peer_reviewed else 0,
        doc.cited_by_count,
    )


def independence_score(cluster_size: int, total_clusters: int) -> int:
    """0-100 for a single document, given how crowded its cluster is."""
    if cluster_size <= 1:
        base = 92
    elif cluster_size == 2:
        base = 70
    elif cluster_size == 3:
        base = 55
    else:
        base = max(25, 55 - (cluster_size - 3) * 8)
    # A varied evidence pool lifts everything a little.
    if total_clusters >= 6:
        base = min(100, base + 6)
    elif total_clusters <= 2:
        base = max(10, base - 12)
    return base
