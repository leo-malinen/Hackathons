"""Domain types shared by the pipeline, the API and (mirrored) the frontend."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# Enumerations
# --------------------------------------------------------------------------
class ClaimType(str, Enum):
    FACTUAL = "FACTUAL"
    OPINION = "OPINION"
    PREDICTION = "PREDICTION"
    VALUE_JUDGMENT = "VALUE_JUDGMENT"
    UNVERIFIABLE = "UNVERIFIABLE"


class Relationship(str, Enum):
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    CONTEXTUALIZES = "CONTEXTUALIZES"
    INCONCLUSIVE = "INCONCLUSIVE"
    IRRELEVANT = "IRRELEVANT"


class Verdict(str, Enum):
    SUPPORTED = "SUPPORTED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    MISLEADING = "MISLEADING"
    CONTRADICTED = "CONTRADICTED"
    INCONCLUSIVE = "INCONCLUSIVE"
    NOT_CHECKABLE = "NOT_CHECKABLE"


class SourceTier(str, Enum):
    """Retrieval priority ladder from PRD section 30."""

    PRIMARY_RESEARCH = "PRIMARY_RESEARCH"
    GOVERNMENT = "GOVERNMENT"
    ACADEMIC = "ACADEMIC"
    INSTITUTIONAL = "INSTITUTIONAL"
    JOURNALISM = "JOURNALISM"
    EXPERT_ORG = "EXPERT_ORG"
    REFERENCE = "REFERENCE"
    SECONDARY = "SECONDARY"
    BLOG_SOCIAL = "BLOG_SOCIAL"
    UNKNOWN = "UNKNOWN"


# --------------------------------------------------------------------------
# Claim
# --------------------------------------------------------------------------
class NormalizedClaim(BaseModel):
    subject: str | None = None
    predicate: str | None = None
    object: str | None = None
    magnitude: str | None = None
    population: str | None = None
    time_period: str | None = None
    location: str | None = None
    source_cited: str | None = None
    # How pinned-down the claim is. Vague claims cap achievable confidence.
    specificity: float = Field(0.5, ge=0.0, le=1.0)


class Claim(BaseModel):
    id: str
    text: str
    type: ClaimType
    rationale: str = ""
    normalized: NormalizedClaim | None = None
    checkworthiness: float = Field(0.5, ge=0.0, le=1.0)
    verdict: Verdict | None = None
    confidence: float | None = None
    explanation: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Evidence
# --------------------------------------------------------------------------
class RetrievedDoc(BaseModel):
    """A raw search hit, before any model has evaluated it."""

    id: str
    title: str
    url: str
    snippet: str = ""
    publisher: str = ""
    published_at: str | None = None
    provider: str = ""
    doi: str | None = None
    openalex_id: str | None = None
    referenced_works: list[str] = Field(default_factory=list)
    cited_by_count: int = 0
    is_peer_reviewed: bool = False
    is_oa: bool = False
    doc_type: str = ""
    full_text: str = ""
    query: str = ""
    agent: str = "researcher"


class QualityBreakdown(BaseModel):
    authority: int = 0
    evidence_quality: int = 0
    recency: int = 0
    relevance: int = 0
    independence: int = 0
    overall: int = 0


class Evidence(BaseModel):
    id: str
    claim_id: str
    title: str
    url: str
    publisher: str = ""
    published_at: str | None = None
    provider: str = ""
    doi: str | None = None
    tier: SourceTier = SourceTier.UNKNOWN
    relationship: Relationship = Relationship.INCONCLUSIVE
    stance_confidence: float = Field(0.5, ge=0.0, le=1.0)
    relevance_score: int = 0
    quality_score: int = 0
    quality: QualityBreakdown = Field(default_factory=QualityBreakdown)
    why_it_matters: str = ""
    key_quote: str = ""
    cluster_id: str = ""
    is_cluster_representative: bool = True
    effective_weight: float = 0.0
    cited_by_count: int = 0
    is_peer_reviewed: bool = False
    found_by: str = "researcher"
    injection_flagged: bool = False


# --------------------------------------------------------------------------
# Source independence
# --------------------------------------------------------------------------
class SourceCluster(BaseModel):
    id: str
    reason: str
    member_ids: list[str]
    representative_id: str
    traces_to: str | None = None


# --------------------------------------------------------------------------
# Evidence graph
# --------------------------------------------------------------------------
class GraphNode(BaseModel):
    id: str
    type: Literal[
        "input", "claim", "bucket", "evidence", "analysis", "verdict", "cluster"
    ]
    label: str
    data: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""
    kind: Literal[
        "supports", "contradicts", "context", "inconclusive", "flow", "derives"
    ] = "flow"


class EvidenceGraph(BaseModel):
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Challenge, the "Prove Me Wrong" loop
# --------------------------------------------------------------------------
class ChallengeRound(BaseModel):
    counterargument: str
    strongest_counter_evidence_ids: list[str] = Field(default_factory=list)
    assessment: str
    verdict_changed: bool = False
    verdict_before: Verdict
    verdict_after: Verdict
    confidence_before: float
    confidence_after: float
    new_evidence: list[Evidence] = Field(default_factory=list)
    queries_run: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Investigation
# --------------------------------------------------------------------------
class InvestigationStats(BaseModel):
    claims_extracted: int = 0
    claims_investigated: int = 0
    queries_run: int = 0
    sources_retrieved: int = 0
    sources_irrelevant: int = 0
    duplicate_chains: int = 0
    independent_sources: int = 0
    high_quality_sources: int = 0
    primary_sources: int = 0
    supporting: int = 0
    contradicting: int = 0
    contextualizing: int = 0
    injection_attempts_blocked: int = 0
    elapsed_seconds: float = 0.0
    llm_calls: int = 0
    tokens_used: int = 0


class Investigation(BaseModel):
    id: str
    input_text: str
    input_type: Literal["text", "url", "image", "transcript"] = "text"
    source_url: str | None = None
    status: Literal["running", "complete", "error"] = "running"
    claims: list[Claim] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    clusters: list[SourceCluster] = Field(default_factory=list)
    verdict: Verdict | None = None
    confidence: float = 0.0
    headline: str = ""
    summary: str = ""
    reasoning: str = ""
    missing_context: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    graph: EvidenceGraph = Field(default_factory=EvidenceGraph)
    stats: InvestigationStats = Field(default_factory=InvestigationStats)
    challenge: ChallengeRound | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --------------------------------------------------------------------------
# API payloads
# --------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    content: str = ""
    url: str | None = None
    image_base64: str | None = None
    input_type: Literal["text", "url", "image", "transcript"] = "text"
    depth: Literal["quick", "standard", "deep"] = "standard"


class TimelineEvent(BaseModel):
    step: str
    label: str
    status: Literal["start", "done", "warn", "error"] = "done"
    detail: str = ""
    count: int | None = None
    at: float = 0.0
