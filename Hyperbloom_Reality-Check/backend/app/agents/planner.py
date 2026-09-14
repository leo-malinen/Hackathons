"""Search planning for Agent 2 (Researcher) and Agent 3 (Skeptic).

PRD sections 13 and 29. One planner call produces two query sets, because the
Researcher and the Skeptic must not search the same way. If only the
Researcher searched, the system would find what it went looking for, and
confirmation bias would be baked into the retrieval layer itself.
"""
from __future__ import annotations

from typing import Any

from ..schemas import Claim
from .base import STR, Agent, arr, enum, obj


class SearchPlanner(Agent):
    name = "search_planner"
    schema_name = "search_plan"
    max_tokens = 1800
    role = """
You turn one claim into search queries for an evidence retrieval system that
queries scholarly databases (OpenAlex, Europe PMC, Crossref), Wikipedia and
the open web.

Produce two DIFFERENT sets:

researcher_queries: neutral queries that would surface the best available
evidence on the topic, whichever way it points. Use the technical vocabulary
a specialist would use, not the phrasing of the claim. For a health claim
that means terms like "all-cause mortality", "cohort study", "meta-analysis".

skeptic_queries: queries deliberately aimed at evidence that would REFUTE or
complicate the claim. Search for debunking, failed replication, methodological
criticism, contrary findings, systematic reviews that found no effect. Use the
vocabulary of disagreement: "no association", "failed to replicate",
"criticism", "overstated", "myth".

Rules:
- Keyword queries, not questions. No quotation marks, no boolean operators.
- 3 to 5 per set. Each must search for something genuinely different; near
  duplicates waste a retrieval slot.
- Never include words like "is it true" or "fact check" in a scholarly query.
- domain_profile: "scientific" for medical, health, physics, biology,
  psychology, climate or nutrition claims; "general" for history, business,
  celebrity, politics, product or current-events claims; "balanced" when both
  literatures matter.
- search_language_note: one short line on the terminology you chose and why.
"""
    schema = obj({
        "researcher_queries": arr(STR, max_items=5),
        "skeptic_queries": arr(STR, max_items=5),
        "domain_profile": enum("scientific", "general", "balanced"),
        "search_language_note": STR,
        "key_entities": arr(STR, max_items=6),
    })

    async def plan(self, claim: Claim) -> dict[str, Any]:
        lines = [f"CLAIM: {claim.text}"]
        if claim.normalized:
            norm = claim.normalized
            parts = [
                ("subject", norm.subject), ("predicate", norm.predicate),
                ("object", norm.object), ("magnitude", norm.magnitude),
                ("population", norm.population), ("time period", norm.time_period),
                ("location", norm.location), ("cited source", norm.source_cited),
            ]
            stated = [f"  {label}: {value}" for label, value in parts if value]
            if stated:
                lines.append("STRUCTURED FORM:")
                lines.extend(stated)
        lines.append("\nPlan the retrieval. Return JSON only.")
        return await self.run("\n".join(lines))


def dedupe_queries(queries: list[str], *, limit: int) -> list[str]:
    """Drop blanks, near-duplicates and over-long queries."""
    seen: set[frozenset[str]] = set()
    kept: list[str] = []
    for raw in queries:
        query = " ".join((raw or "").split())[:180]
        if len(query) < 4:
            continue
        signature = frozenset(w.lower() for w in query.split() if len(w) > 2)
        if not signature or signature in seen:
            continue
        # Treat a query as duplicate if it is almost a subset of an earlier one.
        if any(len(signature & prior) / max(1, len(signature)) > 0.82 for prior in seen):
            continue
        seen.add(signature)
        kept.append(query)
        if len(kept) >= limit:
            break
    return kept


def fallback_queries(claim: Claim) -> tuple[list[str], list[str]]:
    """Used only if the planner call fails outright, so retrieval still runs."""
    text = " ".join(claim.text.split())[:160]
    subject = (claim.normalized.subject if claim.normalized else None) or text
    return (
        [text, f"{subject} study evidence", f"{subject} research findings"],
        [f"{subject} debunked", f"{subject} no evidence", f"{subject} criticism myth"],
    )
