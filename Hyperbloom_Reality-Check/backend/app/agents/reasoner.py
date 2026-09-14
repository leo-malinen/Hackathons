"""Agent 5, the Reasoner.

PRD sections 18 to 20. Reads the assessed evidence together with the
deterministic scores from the verdict engine and decides what the body of
evidence actually establishes.

The division of labour matters. The engine owns the arithmetic: evidence
mass, independence, confidence. The Reasoner owns the judgements arithmetic
cannot make, above all whether a claim is technically true but creates a
false impression, which is the MISLEADING case the PRD cares most about. It
may move the computed verdict, but only one step, and only with a stated
reason.
"""
from __future__ import annotations

from typing import Any

from ..schemas import Evidence, Verdict
from ..verdict.engine import VerdictComputation
from .base import BOOL, NUM, STR, Agent, arr, enum, obj


class Reasoner(Agent):
    name = "reasoner"
    schema_name = "reasoning"
    max_tokens = 3000
    role = """
You weigh assessed evidence and decide what it establishes about one claim.

You are given a computed verdict derived from evidence mass, source quality
and source independence. Treat it as a strong prior. You may move it by ONE
step on this ladder, and only when you can name the specific reason:

  SUPPORTED - PARTIALLY_SUPPORTED - MISLEADING - CONTRADICTED
  (INCONCLUSIVE sits outside the ladder)

Your real job is the judgements arithmetic cannot make:

overstates_evidence: true when the claim's underlying finding is real but the
claim asserts more than the evidence showed. A bigger number, a broader
population, proof instead of correlation, a general rule from a narrow study.
This is the single most common failure mode in viral content and it is what
separates MISLEADING from CONTRADICTED. A wholly fabricated claim is
CONTRADICTED; a real finding stretched out of shape is MISLEADING.

cherry_picked_magnitude: true when a specific figure in the claim is not the
figure the evidence supports.

missing_context: 1 to 3 things a reader needs in order to read this claim
correctly and which the claim omits. Concrete and drawn from the evidence in
front of you, never generic caution. "The study followed 40 men for six
weeks" is useful. "More research is needed" is not.

limitations: 1 to 3 honest weaknesses in THIS investigation. Thin evidence,
sources all tracing to one origin, no primary research retrieved, evidence
older than the claim. If the investigation was genuinely solid, say so in one
short entry rather than inventing a flaw.

reasoning: 60 to 140 words. What was claimed, what the evidence shows, why
that produces this verdict. Reference sources by their number, like [2].
Never cite a source number you were not given.

verdict_adjustment_reason: "" when you keep the computed verdict.
"""
    schema = obj({
        "verdict": enum(
            "SUPPORTED", "PARTIALLY_SUPPORTED", "MISLEADING",
            "CONTRADICTED", "INCONCLUSIVE",
        ),
        "verdict_adjustment_reason": STR,
        "overstates_evidence": BOOL,
        "cherry_picked_magnitude": BOOL,
        "confidence_note": STR,
        "reasoning": STR,
        "missing_context": arr(STR, max_items=3),
        "limitations": arr(STR, max_items=3),
        "strongest_supporting_index": NUM,
        "strongest_contradicting_index": NUM,
    })

    async def reason(
        self,
        claim_text: str,
        evidence: list[Evidence],
        computation: VerdictComputation,
        *,
        normalized_hint: str = "",
    ) -> dict[str, Any]:
        lines: list[str] = [f"CLAIM UNDER TEST:\n{claim_text}"]
        if normalized_hint:
            lines.append(f"\nSTRUCTURED FORM:\n{normalized_hint}")

        lines.append("\n--- ASSESSED EVIDENCE ---")
        if evidence:
            for index, item in enumerate(evidence):
                flags = []
                if item.is_peer_reviewed:
                    flags.append("peer reviewed")
                if item.cited_by_count:
                    flags.append(f"cited {item.cited_by_count}x")
                if not item.is_cluster_representative:
                    flags.append(f"duplicate of group {item.cluster_id}")
                if item.injection_flagged:
                    flags.append("ATTEMPTED MANIPULATION, credibility reduced")
                lines.append(
                    f"\n[{index}] {item.relationship.value} | quality {item.quality_score}"
                    f"/100 | relevance {item.relevance_score}/100 | group "
                    f"{item.cluster_id}{' | ' + ', '.join(flags) if flags else ''}"
                    f"\n    {item.title} ({item.publisher or 'unknown'}, "
                    f"{item.published_at or 'undated'})"
                    f"\n    assessment: {item.why_it_matters}"
                    + (f'\n    quote: "{item.key_quote}"' if item.key_quote else "")
                )
        else:
            lines.append("\n(no usable evidence was retrieved)")

        lines.append(
            "\n--- COMPUTED SCORES (deterministic, from evidence mass) ---\n"
            f"computed verdict: {computation.verdict.value}\n"
            f"computed confidence: {computation.confidence:.2f}\n"
            f"supporting weight: {computation.support_mass} | contradicting weight: "
            f"{computation.contradict_mass} | contextual weight: {computation.context_mass}\n"
            f"independent source groups: {computation.independent_clusters}\n"
            f"mean source quality: {computation.mean_quality}/100\n"
            + ("caps applied: " + "; ".join(computation.caps_applied) + "\n"
               if computation.caps_applied else "")
        )
        lines.append("\nReturn your reasoning as JSON only.")
        return await self.run("\n".join(lines))


_LADDER = [
    Verdict.SUPPORTED,
    Verdict.PARTIALLY_SUPPORTED,
    Verdict.MISLEADING,
    Verdict.CONTRADICTED,
]


def reconcile(computed: Verdict, proposed: Verdict, reason: str) -> tuple[Verdict, str]:
    """Allow the Reasoner one step of movement, and only with a reason given.

    Anything larger is treated as the model drifting away from the evidence,
    so the computed verdict stands and the disagreement is recorded.
    """
    if proposed is computed:
        return computed, ""

    # Movement into or out of INCONCLUSIVE is always allowed: only the
    # Reasoner can see that sources are talking past each other.
    if Verdict.INCONCLUSIVE in (computed, proposed):
        if reason.strip():
            return proposed, reason.strip()
        return computed, ""

    if computed not in _LADDER or proposed not in _LADDER:
        return computed, ""

    distance = abs(_LADDER.index(proposed) - _LADDER.index(computed))
    if distance <= 1 and reason.strip():
        return proposed, reason.strip()
    return computed, ""
