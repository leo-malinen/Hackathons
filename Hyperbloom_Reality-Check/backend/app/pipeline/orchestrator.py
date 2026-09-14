"""The investigation orchestrator.

Runs the full pipeline from PRD section 27 and streams progress events as it
goes, so the UI can show the investigation happening rather than a spinner
followed by an answer.

    input -> claims -> normalisation -> search planning
          -> researcher retrieval + skeptic retrieval (concurrent)
          -> dedupe -> independence clustering -> page enrichment
          -> source criticism -> quality scoring -> verdict arithmetic
          -> reasoning -> aggregation -> editing -> graph

Claims are investigated concurrently. Within a claim, the Researcher and the
Skeptic search at the same time, which is both faster and the point: the
system looks for evidence against a claim as hard as it looks for evidence
for it.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

from ..agents.advocate import DevilsAdvocateAdjudicate, DevilsAdvocateAttack
from ..agents.critic import BATCH_SIZE, SourceCritic, parse_assessments, verify_quote
from ..agents.editor import Editor, VisionReader
from ..agents.extractor import (
    ClaimExtractor,
    ClaimNormalizer,
    apply_normalization,
    build_claims,
)
from ..agents.planner import SearchPlanner, dedupe_queries, fallback_queries
from ..agents.reasoner import Reasoner, reconcile
from ..config import settings
from ..llm.openrouter import LLMError, OpenRouterClient, QuotaExhausted
from ..retrieval.base import normalise_url, stable_id
from ..retrieval.fetcher import fetch_page
from ..retrieval.providers import search_all
from ..schemas import (
    AnalyzeRequest,
    Claim,
    ClaimType,
    ChallengeRound,
    Evidence,
    Investigation,
    InvestigationStats,
    Relationship,
    RetrievedDoc,
    Verdict,
)
from ..scoring.independence import cluster_sources, independence_score
from ..scoring.quality import (
    classify_source,
    combine,
    score_evidence_quality,
    score_recency,
)
from ..security.sanitize import sanitise
from ..verdict.engine import aggregate, compute
from .graph import build_graph

log = logging.getLogger("reality_check.pipeline")

Emit = Callable[[str, dict[str, Any]], Any]

# Claim types that never enter the verification pipeline (PRD section 11).
_UNCHECKABLE = {ClaimType.OPINION, ClaimType.VALUE_JUDGMENT}

_DEPTH: dict[str, dict[str, int]] = {
    "quick":    {"claims": 1, "queries": 3, "sources": 8,  "enrich": 3},
    "standard": {"claims": 2, "queries": 4, "sources": 12, "enrich": 4},
    "deep":     {"claims": 3, "queries": 5, "sources": 20, "enrich": 6},
}

_WORD = re.compile(r"[a-z0-9]+")
# Words that carry no topic signal when matching a claim to a document.
_RANK_STOPWORDS = {
    "that", "this", "with", "from", "have", "has", "been", "were", "was",
    "will", "would", "could", "should", "their", "there", "they", "than",
    "then", "only", "just", "more", "most", "some", "such", "into", "over",
    "about", "after", "before", "because", "while", "which", "what", "when",
    "your", "you", "our", "its", "his", "her", "the", "and", "for", "are",
    "people", "study", "studies", "research", "new", "says", "said", "proves",
    "proven", "scientists", "according",
}


# Words that assert certainty or causation. A claim using them needs evidence
# that actually establishes causation, which observational work cannot.
_CERTAINTY_WORDS = re.compile(
    r"\b(?:prove[nsd]?|proof|confirms?|confirmed|establishes?|shows?\s+that|"
    r"definitiv\w+|conclusiv\w+|guarantee[sd]?|causes?|caused)\b",
    re.I,
)


def _looks_overstated(claim: Claim, evidence: list[Evidence]) -> bool:
    """Structural stand-in for the Reasoner's overstatement judgement.

    Fires only on the specific shape the Reasoner would catch: a claim that
    asserts a hard number or proves causation, where the retrieved evidence
    engages with the topic but nothing actually supports it as stated. That is
    the signature of a real finding stretched out of shape.
    """
    relevant = [e for e in evidence if e.relevance_score >= 45]
    if len(relevant) < 3:
        return False  # too little evidence to infer anything

    supporting = [e for e in relevant if e.relationship is Relationship.SUPPORTS]
    engaged = [
        e for e in relevant
        if e.relationship in (Relationship.CONTEXTUALIZES, Relationship.CONTRADICTS)
    ]
    if supporting or len(engaged) < 3:
        return False

    has_magnitude = bool(claim.normalized and claim.normalized.magnitude)
    asserts_certainty = bool(_CERTAINTY_WORDS.search(claim.text))
    return has_magnitude or asserts_certainty


class Investigator:
    def __init__(self, client: OpenRouterClient) -> None:
        self.client = client
        self.extractor = ClaimExtractor(client)
        self.normalizer = ClaimNormalizer(client)
        self.planner = SearchPlanner(client)
        self.critic = SourceCritic(client)
        self.reasoner = Reasoner(client)
        self.editor = Editor(client)
        self.vision = VisionReader(client)
        self.attacker = DevilsAdvocateAttack(client)
        self.adjudicator = DevilsAdvocateAdjudicate(client)

    # ------------------------------------------------------------------
    # Input resolution
    # ------------------------------------------------------------------
    async def resolve_input(
        self, request: AnalyzeRequest, emit: Emit
    ) -> tuple[str, str | None, list[str]]:
        """Return (text to analyse, source url, notes)."""
        notes: list[str] = []

        if request.input_type == "image" and request.image_base64:
            await emit("step", {"step": "ocr", "label": "Reading image", "status": "start"})
            try:
                reading = await self.vision.read_image(
                    request.image_base64, note=request.content or ""
                )
            except LLMError as exc:
                raise ValueError(f"Could not read the image: {exc}") from exc

            transcription = (reading.get("transcription") or "").strip()
            visual = (reading.get("describes_visual") or "").strip()
            hint = (reading.get("source_hint") or "").strip()

            if reading.get("contains_instructions"):
                notes.append(
                    "The image contained text addressed to an AI system. It was "
                    "transcribed as content and not acted on."
                )

            if not transcription and not visual:
                raise ValueError("No readable text or claims were found in that image.")

            combined = transcription
            if visual:
                combined += f"\n\n[Visual content: {visual}]"
            if hint:
                notes.append(f"Image appears to come from: {hint}")

            await emit("step", {
                "step": "ocr", "label": "Read image",
                "detail": f"{len(transcription.split())} words transcribed",
                "status": "done",
            })
            return combined, None, notes

        if request.input_type == "url" or (request.url and not request.content):
            url = (request.url or request.content).strip()
            await emit("step", {
                "step": "fetch", "label": "Fetching page", "status": "start", "detail": url,
            })
            page = await fetch_page(url)
            if not page.ok or len(page.text) < 120:
                raise ValueError(
                    f"Could not read that page ({page.error or 'no article text found'}). "
                    "Try pasting the text instead."
                )
            if page.injection_findings:
                notes.append(
                    f"{len(page.injection_findings)} instruction-like passage(s) in that "
                    "page were neutralised before analysis."
                )
            await emit("step", {
                "step": "fetch", "label": "Fetched page",
                "detail": f"{page.title[:70] or url}, {len(page.text.split())} words",
                "status": "done",
            })
            header = f"{page.title}\n\n" if page.title else ""
            return f"{header}{page.text}", url, notes

        text = (request.content or "").strip()
        if len(text) < 8:
            raise ValueError("Please provide a claim, some text, a URL or an image.")
        cleaned = sanitise(text, max_chars=20000)
        if cleaned.findings:
            notes.append("Instruction-like text in the submission was neutralised.")
        return cleaned.text, request.url, notes

    # ------------------------------------------------------------------
    # Retrieval and assessment for a single claim
    # ------------------------------------------------------------------
    async def _retrieve(
        self, claim: Claim, limits: dict[str, int], emit: Emit
    ) -> tuple[list[RetrievedDoc], list[str], str]:
        try:
            plan = await self.planner.plan(claim)
            researcher = dedupe_queries(
                plan.get("researcher_queries") or [], limit=limits["queries"]
            )
            skeptic = dedupe_queries(
                plan.get("skeptic_queries") or [], limit=max(2, limits["queries"] - 1)
            )
            profile = plan.get("domain_profile") or "balanced"
        except QuotaExhausted:
            raise
        except LLMError as exc:
            log.warning("planner failed, using fallback queries: %s", exc)
            researcher, skeptic = fallback_queries(claim)
            researcher = researcher[: limits["queries"]]
            skeptic = skeptic[:2]
            profile = "balanced"

        if not researcher:
            researcher, skeptic = fallback_queries(claim)

        all_queries = researcher + skeptic
        await emit("step", {
            "step": "plan", "label": "Generated search queries",
            "count": len(all_queries), "claim_id": claim.id,
            "detail": f"{len(researcher)} neutral, {len(skeptic)} adversarial",
        })

        tasks = [search_all(q, profile, agent="researcher") for q in researcher]
        tasks += [search_all(q, profile, agent="skeptic") for q in skeptic]
        settled = await asyncio.gather(*tasks, return_exceptions=True)

        docs: list[RetrievedDoc] = []
        for result in settled:
            if isinstance(result, BaseException):
                log.warning("retrieval task failed: %s", result)
                continue
            docs.extend(result)

        return docs, all_queries, profile

    def _dedupe(
        self, docs: list[RetrievedDoc], limit: int, claim_text: str = ""
    ) -> list[RetrievedDoc]:
        """Collapse identical hits, then keep the most promising documents.

        Ranking here is cheap and mechanical, before any model has read
        anything. It decides which documents are worth a model's attention,
        never what they mean.

        Topical overlap is weighted heavily and deliberately. An earlier
        version ranked on authority alone and kept prestigious papers that had
        nothing to do with the claim, starving the critic of usable evidence.
        A high-authority journal is only useful if it is about the claim.
        """
        claim_terms = {
            w for w in _WORD.findall(claim_text.lower())
            if len(w) > 3 and w not in _RANK_STOPWORDS
        }

        def topicality(doc: RetrievedDoc) -> float:
            if not claim_terms:
                return 0.5
            haystack = set(_WORD.findall(f"{doc.title} {doc.snippet}".lower()))
            return len(claim_terms & haystack) / len(claim_terms)

        best: dict[str, RetrievedDoc] = {}
        for doc in docs:
            key = (doc.doi or "").lower() or normalise_url(doc.url) or doc.title.lower()
            if not key:
                continue
            existing = best.get(key)
            if existing is None:
                best[key] = doc
                continue
            # Keep whichever copy carries the richer metadata.
            richer = max(
                (existing, doc),
                key=lambda d: (
                    len(d.referenced_works), d.cited_by_count,
                    len(d.snippet), 1 if d.doi else 0,
                ),
            )
            richer.agent = existing.agent if existing.agent == doc.agent else "both"
            best[key] = richer

        def rank(doc: RetrievedDoc) -> float:
            authority, _ = classify_source(doc)
            return (
                topicality(doc) * 3.0          # being about the claim dominates
                + (authority / 100.0) * 1.6
                + (0.6 if doc.is_peer_reviewed else 0.0)
                + min(1.0, doc.cited_by_count / 500.0) * 0.5
                + min(1.0, len(doc.snippet) / 900.0) * 0.4
                + (0.5 if doc.agent in ("skeptic", "both") else 0.0)
            )

        ranked = sorted(best.values(), key=rank, reverse=True)

        # Guarantee the Skeptic's findings survive the cut. Without this the
        # authority ranking can quietly filter out the contrary evidence.
        skeptic_docs = [d for d in ranked if d.agent in ("skeptic", "both")]
        reserved = skeptic_docs[: max(3, limit // 3)]
        remaining = [d for d in ranked if d not in reserved]
        return (reserved + remaining)[:limit]

    async def _enrich(self, docs: list[RetrievedDoc], count: int) -> int:
        """Fetch real page text for the top documents, so the critic reads more
        than a snippet. Returns the number of injection attempts neutralised."""
        targets = [d for d in docs if len(d.snippet) < 700][:count]
        if not targets:
            return 0

        pages = await asyncio.gather(
            *(fetch_page(d.url, max_chars=6000) for d in targets),
            return_exceptions=True,
        )
        blocked = 0
        for doc, page in zip(targets, pages):
            if isinstance(page, BaseException) or not getattr(page, "ok", False):
                continue
            doc.full_text = page.text
            if page.injection_findings:
                blocked += len(page.injection_findings)
            if not doc.published_at and page.published_at:
                doc.published_at = page.published_at
        return blocked

    async def _assess(
        self, claim: Claim, docs: list[RetrievedDoc], emit: Emit
    ) -> list[Evidence]:
        """Run the Source Critic over documents in batches, concurrently."""
        normalized_hint = ""
        if claim.normalized:
            stated = {
                k: v for k, v in claim.normalized.model_dump().items()
                if v not in (None, "", 0.5) and k != "specificity"
            }
            normalized_hint = "\n".join(f"  {k}: {v}" for k, v in stated.items())

        batches = [docs[i : i + BATCH_SIZE] for i in range(0, len(docs), BATCH_SIZE)]
        results = await asyncio.gather(
            *(
                self.critic.assess(claim.text, batch, normalized_hint=normalized_hint)
                for batch in batches
            ),
            return_exceptions=True,
        )

        assessed: list[tuple[RetrievedDoc, dict[str, Any]]] = []
        for batch, result in zip(batches, results):
            if isinstance(result, BaseException):
                log.warning("source critic batch failed: %s", result)
                continue
            parsed = parse_assessments(result)
            for index, doc in enumerate(batch):
                if index in parsed:
                    assessed.append((doc, parsed[index]))

        if not assessed:
            return []

        # --- independence clustering over what survived ------------------
        kept_docs = [
            doc for doc, a in assessed
            if a["relationship"] is not Relationship.IRRELEVANT and a["relevance"] >= 25
        ]
        clusters, assignment = cluster_sources(kept_docs)
        cluster_sizes = {c.id: len(c.member_ids) for c in clusters}
        representatives = {c.representative_id for c in clusters}

        self._last_clusters = clusters

        evidence: list[Evidence] = []
        for doc, assessment in assessed:
            if doc.id not in assignment:
                continue

            cluster_id = assignment[doc.id]
            authority, tier = classify_source(doc)
            independence = independence_score(cluster_sizes[cluster_id], len(clusters))
            quality = combine(
                authority=authority,
                evidence_quality=score_evidence_quality(doc),
                recency=score_recency(doc),
                relevance=assessment["relevance"],
                independence=independence,
            )

            quote = verify_quote(
                assessment["key_quote"], f"{doc.snippet} {doc.full_text}"
            )

            evidence.append(
                Evidence(
                    id=doc.id,
                    claim_id=claim.id,
                    title=doc.title,
                    url=doc.url,
                    publisher=doc.publisher,
                    published_at=doc.published_at,
                    provider=doc.provider,
                    doi=doc.doi,
                    tier=tier,
                    relationship=assessment["relationship"],
                    stance_confidence=assessment["stance_confidence"],
                    relevance_score=assessment["relevance"],
                    quality_score=quality.overall,
                    quality=quality,
                    why_it_matters=assessment["why_it_matters"],
                    key_quote=quote,
                    cluster_id=cluster_id,
                    is_cluster_representative=doc.id in representatives,
                    cited_by_count=doc.cited_by_count,
                    is_peer_reviewed=doc.is_peer_reviewed,
                    found_by=doc.agent,
                    injection_flagged=assessment["manipulation_flag"],
                )
            )

        evidence.sort(key=lambda e: (e.quality_score, e.relevance_score), reverse=True)
        return evidence

    # ------------------------------------------------------------------
    async def investigate_claim(
        self, claim: Claim, limits: dict[str, int], emit: Emit
    ) -> tuple[list[Evidence], list[str], dict[str, Any]]:
        """Full investigation of one claim. Returns (evidence, queries, meta)."""
        self._last_clusters = []

        docs, queries, _profile = await self._retrieve(claim, limits, emit)
        retrieved_count = len(docs)
        await emit("step", {
            "step": "retrieve", "label": "Retrieved sources",
            "count": retrieved_count, "claim_id": claim.id,
        })

        docs = self._dedupe(docs, limits["sources"], claim.text)
        await emit("step", {
            "step": "filter", "label": "Filtered to strongest candidates",
            "count": len(docs), "claim_id": claim.id,
            "detail": f"{retrieved_count - len(docs)} duplicate or weaker hits removed",
        })

        blocked = await self._enrich(docs, limits["enrich"])
        if blocked:
            await emit("step", {
                "step": "security", "label": "Neutralised prompt injection",
                "count": blocked, "status": "warn", "claim_id": claim.id,
                "detail": "Instructions embedded in source pages were stripped",
            })

        evidence = await self._assess(claim, docs, emit)
        clusters = getattr(self, "_last_clusters", [])
        duplicate_chains = sum(1 for c in clusters if len(c.member_ids) > 1)

        supporting = sum(1 for e in evidence if e.relationship is Relationship.SUPPORTS)
        contradicting = sum(1 for e in evidence if e.relationship is Relationship.CONTRADICTS)

        await emit("step", {
            "step": "assess", "label": "Compared evidence against the claim",
            "count": len(evidence), "claim_id": claim.id,
            "detail": f"{supporting} supporting, {contradicting} contradicting",
        })
        if duplicate_chains:
            await emit("step", {
                "step": "independence", "label": "Identified duplicate source chains",
                "count": duplicate_chains, "claim_id": claim.id,
                "detail": f"{len(clusters)} genuinely independent group(s)",
            })

        # --- verdict arithmetic, then reasoning --------------------------
        specificity = claim.normalized.specificity if claim.normalized else 0.5
        computation = compute(evidence, claim_specificity=specificity)

        reasoning_payload: dict[str, Any] = {}
        try:
            normalized_hint = ""
            if claim.normalized:
                stated = {
                    k: v for k, v in claim.normalized.model_dump().items()
                    if v not in (None, "") and k != "specificity"
                }
                normalized_hint = "\n".join(f"  {k}: {v}" for k, v in stated.items())

            reasoning_payload = await self.reasoner.reason(
                claim.text, evidence, computation, normalized_hint=normalized_hint
            )
        except QuotaExhausted:
            raise
        except LLMError as exc:
            log.warning("reasoner failed for claim %s: %s", claim.id, exc)

        # Re-run the arithmetic with the Reasoner's qualitative findings folded in.
        overstates = bool(reasoning_payload.get("overstates_evidence"))
        cherry_picked = bool(reasoning_payload.get("cherry_picked_magnitude"))

        # The Reasoner is the only component that can normally spot an
        # overstatement, so when it is unavailable (free-tier rate limits are
        # the usual cause) every verdict quietly collapses to INCONCLUSIVE.
        # This fallback recovers the signal structurally rather than
        # semantically, from the shape of the claim and of the evidence.
        if not reasoning_payload and not overstates:
            overstates = _looks_overstated(claim, evidence)
            if overstates:
                log.info("reasoner unavailable; overstatement inferred structurally")
        stale_verdict = computation.verdict
        reweighted = False
        if overstates or cherry_picked:
            computation = compute(
                evidence,
                claim_specificity=specificity,
                overstates_evidence=overstates,
                cherry_picked_magnitude=cherry_picked,
            )
            reweighted = computation.verdict is not stale_verdict

        final_verdict = computation.verdict
        adjustment = ""
        if reasoning_payload.get("verdict"):
            try:
                proposed = Verdict(reasoning_payload["verdict"])
                # The Reasoner saw the pre-flag arithmetic, so a proposal that
                # simply echoes it is an anchor on numbers its own findings have
                # since changed. Let the reweighted verdict stand instead.
                if not (reweighted and proposed is stale_verdict):
                    final_verdict, adjustment = reconcile(
                        computation.verdict,
                        proposed,
                        reasoning_payload.get("verdict_adjustment_reason", ""),
                    )
            except ValueError:
                pass

        claim.verdict = final_verdict
        claim.confidence = computation.confidence
        claim.explanation = (reasoning_payload.get("reasoning") or "").strip()
        claim.evidence_ids = [e.id for e in evidence]

        await emit("step", {
            "step": "verdict", "label": f"Claim verdict: {final_verdict.value.replace('_', ' ')}",
            "claim_id": claim.id,
            "detail": f"{computation.confidence:.0%} confidence, "
                      f"{computation.independent_clusters} independent group(s)",
        })

        meta = {
            "computation": computation,
            "reasoning": reasoning_payload,
            "clusters": clusters,
            "retrieved": retrieved_count,
            "irrelevant": retrieved_count - len(evidence),
            "duplicate_chains": duplicate_chains,
            "adjustment": adjustment,
        }
        return evidence, queries, meta

    # ------------------------------------------------------------------
    # Whole-investigation entry point
    # ------------------------------------------------------------------
    async def run(
        self, request: AnalyzeRequest, investigation_id: str, emit: Emit
    ) -> Investigation:
        started = time.perf_counter()
        limits = _DEPTH.get(request.depth, _DEPTH["standard"])

        investigation = Investigation(
            id=investigation_id,
            input_text=request.content or request.url or "",
            input_type=request.input_type,
        )

        text, source_url, notes = await self.resolve_input(request, emit)
        investigation.input_text = text
        investigation.source_url = source_url

        # --- claim extraction --------------------------------------------
        await emit("step", {"step": "extract", "label": "Extracting claims", "status": "start"})
        extraction = await self.extractor.extract(text, source_url=source_url)
        claims = build_claims(extraction)
        if not claims:
            raise ValueError("No checkable claims were found in that content.")
        investigation.claims = claims

        factual = [c for c in claims if c.type not in _UNCHECKABLE]
        await emit("step", {
            "step": "extract", "label": "Extracted claims", "count": len(claims),
            "detail": f"{len(factual)} checkable, "
                      f"{len(claims) - len(factual)} opinion or value judgement",
        })

        if not factual:
            return await self._finish_uncheckable(investigation, claims, notes, started, emit)

        # --- normalisation -----------------------------------------------
        # Skipped in quick mode to save a call against the model quota. It
        # improves search precision but nothing downstream requires it.
        if request.depth != "quick":
            try:
                apply_normalization(factual, await self.normalizer.normalize(factual))
                await emit("step", {
                    "step": "normalize", "label": "Normalised claims into structured form",
                    "count": len(factual),
                })
            except QuotaExhausted:
                raise
            except LLMError as exc:
                log.warning("normalizer failed: %s", exc)

        # --- investigate each claim concurrently -------------------------
        selected = sorted(factual, key=lambda c: c.checkworthiness, reverse=True)[
            : limits["claims"]
        ]
        await emit("step", {
            "step": "select", "label": "Selected claims to investigate",
            "count": len(selected),
            "detail": "ranked by how much the content depends on them",
        })

        results = await asyncio.gather(
            *(self.investigate_claim(c, limits, emit) for c in selected),
            return_exceptions=True,
        )

        all_evidence: list[Evidence] = []
        all_clusters = []
        stats = InvestigationStats()
        per_claim: list[tuple[Verdict, float, float]] = []
        reasonings: list[str] = []

        for claim, result in zip(selected, results):
            if isinstance(result, BaseException):
                log.error("claim investigation failed: %s", result, exc_info=result)
                await emit("step", {
                    "step": "claim_error", "status": "error", "claim_id": claim.id,
                    "label": "A claim could not be investigated",
                    "detail": str(result)[:180],
                })
                continue

            evidence, queries, meta = result
            all_evidence.extend(evidence)
            all_clusters.extend(meta["clusters"])

            stats.queries_run += len(queries)
            stats.sources_retrieved += meta["retrieved"]
            stats.sources_irrelevant += max(0, meta["irrelevant"])
            stats.duplicate_chains += meta["duplicate_chains"]

            reasoning = meta["reasoning"]
            if reasoning.get("reasoning"):
                reasonings.append(f"On \"{claim.text[:80]}\": {reasoning['reasoning']}")
            investigation.missing_context.extend(reasoning.get("missing_context") or [])
            investigation.limitations.extend(reasoning.get("limitations") or [])

            if claim.verdict:
                per_claim.append((claim.verdict, claim.confidence or 0.0, claim.checkworthiness))

        investigation.evidence = all_evidence
        investigation.clusters = all_clusters

        # --- aggregate ----------------------------------------------------
        verdict, confidence = aggregate(per_claim)
        investigation.verdict = verdict
        investigation.confidence = confidence
        investigation.reasoning = "\n\n".join(reasonings)

        stats.claims_extracted = len(claims)
        stats.claims_investigated = len([c for c in selected if c.verdict])
        stats.independent_sources = len({c.id for c in all_clusters})
        stats.high_quality_sources = sum(1 for e in all_evidence if e.quality_score >= 75)
        stats.primary_sources = sum(
            1 for e in all_evidence
            if e.tier.value in ("PRIMARY_RESEARCH", "GOVERNMENT", "ACADEMIC")
        )
        stats.supporting = sum(
            1 for e in all_evidence if e.relationship is Relationship.SUPPORTS
        )
        stats.contradicting = sum(
            1 for e in all_evidence if e.relationship is Relationship.CONTRADICTS
        )
        stats.contextualizing = sum(
            1 for e in all_evidence if e.relationship is Relationship.CONTEXTUALIZES
        )
        stats.injection_attempts_blocked = sum(
            1 for e in all_evidence if e.injection_flagged
        )

        # --- editing ------------------------------------------------------
        await emit("step", {"step": "explain", "label": "Writing the explanation", "status": "start"})
        try:
            written = await self.editor.write(
                text, selected, verdict, confidence, all_evidence,
                investigation.reasoning, investigation.missing_context,
            )
            investigation.headline = (written.get("headline") or "").strip()
            investigation.summary = (written.get("summary") or "").strip()
        except QuotaExhausted:
            raise
        except LLMError as exc:
            log.warning("editor failed: %s", exc)
            investigation.headline = verdict.value.replace("_", " ").title()
            investigation.summary = investigation.reasoning[:900] or (
                "The investigation completed but the summary could not be written."
            )

        if notes:
            investigation.limitations.extend(notes)

        investigation.graph = build_graph(
            input_text=text, claims=investigation.claims, evidence=all_evidence,
            clusters=all_clusters, verdict=verdict, confidence=confidence,
        )

        stats.elapsed_seconds = round(time.perf_counter() - started, 2)
        stats.llm_calls = self.client.usage.calls
        stats.tokens_used = self.client.usage.total_tokens
        investigation.stats = stats
        investigation.status = "complete"

        await emit("step", {
            "step": "done", "label": "Investigation complete",
            "detail": f"{stats.elapsed_seconds}s, {stats.llm_calls} model calls",
        })
        return investigation

    async def _finish_uncheckable(
        self, investigation: Investigation, claims: list[Claim],
        notes: list[str], started: float, emit: Emit,
    ) -> Investigation:
        """PRD section 41: opinions cannot be fact checked, and we say so."""
        investigation.verdict = Verdict.NOT_CHECKABLE
        investigation.confidence = 0.0
        investigation.headline = "Opinion, not a factual claim"
        investigation.summary = (
            "This reads as an opinion or a value judgement rather than a factual "
            "claim, so it cannot be fact checked in the traditional sense. There "
            "is no evidence that could confirm or refute a preference. If you "
            "meant to check a specific factual statement inside it, submit that "
            "statement on its own."
        )
        investigation.limitations = notes
        investigation.stats = InvestigationStats(
            claims_extracted=len(claims),
            elapsed_seconds=round(time.perf_counter() - started, 2),
            llm_calls=self.client.usage.calls,
            tokens_used=self.client.usage.total_tokens,
        )
        investigation.graph = build_graph(
            input_text=investigation.input_text, claims=claims, evidence=[],
            clusters=[], verdict=Verdict.NOT_CHECKABLE, confidence=0.0,
        )
        investigation.status = "complete"
        await emit("step", {
            "step": "done", "label": "Not a factual claim", "status": "warn",
            "detail": "Nothing here can be verified against evidence",
        })
        return investigation

    # ------------------------------------------------------------------
    # Prove Me Wrong
    # ------------------------------------------------------------------
    async def challenge(
        self, investigation: Investigation, emit: Emit
    ) -> ChallengeRound:
        if not investigation.verdict or investigation.verdict is Verdict.NOT_CHECKABLE:
            raise ValueError("There is no verdict to challenge.")

        primary = next(
            (c for c in investigation.claims if c.verdict is not None),
            investigation.claims[0] if investigation.claims else None,
        )
        if primary is None:
            raise ValueError("There is no claim to challenge.")

        verdict_before = investigation.verdict
        confidence_before = investigation.confidence

        await emit("step", {
            "step": "challenge_plan", "label": "Building the case against our own verdict",
            "status": "start",
        })
        attack = await self.attacker.attack(
            primary.text, verdict_before, confidence_before,
            investigation.reasoning, investigation.evidence,
        )
        counterargument = (attack.get("counterargument") or "").strip()
        queries = dedupe_queries(attack.get("attack_queries") or [], limit=5)

        await emit("step", {
            "step": "challenge_plan", "label": "Counterargument built",
            "count": len(queries), "detail": attack.get("weakest_link", "")[:160],
        })

        # --- adversarial retrieval ---------------------------------------
        await emit("step", {
            "step": "challenge_search", "label": "Searching for evidence that would overturn it",
            "status": "start", "count": len(queries),
        })
        settled = await asyncio.gather(
            *(search_all(q, "balanced", agent="skeptic") for q in queries),
            return_exceptions=True,
        )
        docs: list[RetrievedDoc] = []
        for result in settled:
            if not isinstance(result, BaseException):
                docs.extend(result)

        known = {e.id for e in investigation.evidence}
        fresh = [d for d in self._dedupe(docs, 14, primary.text) if d.id not in known][:9]

        await emit("step", {
            "step": "challenge_search", "label": "Found new sources not seen before",
            "count": len(fresh),
        })

        new_evidence: list[Evidence] = []
        if fresh:
            await self._enrich(fresh, 4)
            new_evidence = await self._assess(primary, fresh, emit)

        # --- adjudicate ---------------------------------------------------
        await emit("step", {
            "step": "challenge_judge", "label": "Re-evaluating the verdict", "status": "start",
        })
        adjudication = await self.adjudicator.adjudicate(
            primary.text, verdict_before, confidence_before,
            counterargument, new_evidence, investigation.evidence,
        )

        try:
            proposed = Verdict(adjudication.get("final_verdict", verdict_before.value))
        except ValueError:
            proposed = verdict_before

        # The combined evidence pool is the real arbiter. The adjudicator may
        # move one step from what the arithmetic says, exactly as the Reasoner may.
        combined = investigation.evidence + new_evidence
        recomputed = compute(
            combined,
            claim_specificity=primary.normalized.specificity if primary.normalized else 0.5,
        )
        final_verdict, _ = reconcile(
            recomputed.verdict, proposed, adjudication.get("assessment", "")
        )

        try:
            stated_confidence = float(adjudication.get("final_confidence", recomputed.confidence))
        except (TypeError, ValueError):
            stated_confidence = recomputed.confidence
        # Trust the arithmetic, but let the adjudicator pull confidence down.
        final_confidence = round(
            max(0.12, min(recomputed.confidence, max(0.12, min(0.97, stated_confidence)))), 3
        )

        strongest: list[str] = []
        for raw in adjudication.get("strongest_new_evidence_indices") or []:
            try:
                index = int(raw)
            except (TypeError, ValueError):
                continue
            if 0 <= index < len(new_evidence):
                strongest.append(new_evidence[index].id)

        changed = final_verdict is not verdict_before

        await emit("step", {
            "step": "challenge_judge",
            "label": "Verdict changed" if changed else "Verdict survived the challenge",
            "status": "warn" if changed else "done",
            "detail": f"{verdict_before.value.replace('_', ' ')} -> "
                      f"{final_verdict.value.replace('_', ' ')} at {final_confidence:.0%}",
        })

        round_result = ChallengeRound(
            counterargument=counterargument,
            strongest_counter_evidence_ids=strongest,
            assessment=(adjudication.get("assessment") or "").strip(),
            verdict_changed=changed,
            verdict_before=verdict_before,
            verdict_after=final_verdict,
            confidence_before=confidence_before,
            confidence_after=final_confidence,
            new_evidence=new_evidence,
            queries_run=queries,
        )

        # Fold the challenge back into the investigation.
        investigation.verdict = final_verdict
        investigation.confidence = final_confidence
        investigation.evidence = combined
        investigation.challenge = round_result
        if what := (adjudication.get("what_would_change_our_mind") or "").strip():
            investigation.limitations.append(f"What would change this verdict: {what}")

        investigation.stats.sources_retrieved += len(docs)
        investigation.stats.queries_run += len(queries)
        investigation.stats.supporting = sum(
            1 for e in combined if e.relationship is Relationship.SUPPORTS
        )
        investigation.stats.contradicting = sum(
            1 for e in combined if e.relationship is Relationship.CONTRADICTS
        )
        investigation.stats.llm_calls = self.client.usage.calls
        investigation.stats.tokens_used = self.client.usage.total_tokens

        investigation.graph = build_graph(
            input_text=investigation.input_text,
            claims=investigation.claims,
            evidence=combined,
            clusters=investigation.clusters,
            verdict=final_verdict,
            confidence=final_confidence,
        )
        return round_result


# --------------------------------------------------------------------------
async def stream_investigation(
    request: AnalyzeRequest, investigation_id: str, client: OpenRouterClient
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Run an investigation, yielding (event, payload) as it progresses."""
    queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()
    started = time.perf_counter()

    async def emit(event: str, payload: dict[str, Any]) -> None:
        payload.setdefault("at", round(time.perf_counter() - started, 2))
        payload.setdefault("status", "done")
        await queue.put((event, payload))

    investigator = Investigator(client)

    async def worker() -> None:
        try:
            investigation = await investigator.run(request, investigation_id, emit)
            await queue.put(("complete", investigation.model_dump(mode="json")))
        except QuotaExhausted as exc:
            await queue.put(("error", {"message": str(exc), "kind": "quota"}))
        except ValueError as exc:
            await queue.put(("error", {"message": str(exc), "kind": "input"}))
        except Exception as exc:  # noqa: BLE001
            log.exception("investigation failed")
            await queue.put(("error", {"message": str(exc)[:300], "kind": "internal"}))
        finally:
            await queue.put(None)

    task = asyncio.create_task(worker())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
    finally:
        if not task.done():
            task.cancel()
