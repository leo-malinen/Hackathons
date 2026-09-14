"""Agent 6, the Devil's Advocate. This is the "Prove Me Wrong" feature.

PRD sections 22 and 35. After a verdict exists, this agent turns adversarial
toward Reality Check's own conclusion. It runs in two phases with a real
retrieval round between them, which is what makes it different from asking a
model to "consider the other side": the counterargument has to be built from
evidence that was actually found.

  Phase 1  attack   plan searches aimed squarely at overturning the verdict
  ---------- new retrieval and assessment happens here ----------
  Phase 2  adjudicate   weigh what came back, and change the verdict if the
                        evidence genuinely warrants it

The verdict must be allowed to survive. An adversarial agent that always
overturns is no more honest than one that never does.
"""
from __future__ import annotations

from typing import Any

from ..schemas import Evidence, Verdict
from .base import BOOL, NUM, STR, Agent, arr, enum, obj


class DevilsAdvocateAttack(Agent):
    name = "devils_advocate_attack"
    schema_name = "attack_plan"
    max_tokens = 1600
    role = """
You are trying to overturn a verdict that Reality Check has just reached.
Argue against it in good faith and with real force.

Produce:

counterargument: the strongest honest case that the verdict is wrong, in 40
to 90 words. Build it only from the evidence already in front of you and from
what evidence might plausibly exist. Never assert a study or statistic you
have not been shown. If you genuinely cannot construct a real counterargument,
say so plainly instead of manufacturing one.

attack_queries: 3 to 5 keyword searches aimed at finding evidence that would
overturn this verdict. Be specific and adversarial. If the verdict is
CONTRADICTED or MISLEADING, hunt for the strongest study supporting the
original claim, for conditions under which it holds, for subgroups where the
effect is real. If the verdict is SUPPORTED, hunt for failed replications,
methodological criticism, conflicts of interest, contrary meta-analyses.

weakest_link: the single weakest point in the current investigation, named in
one sentence. The thinnest evidence, the most questionable assessment, the
place where the conclusion is least well defended.
"""
    schema = obj({
        "counterargument": STR,
        "attack_queries": arr(STR, max_items=5),
        "weakest_link": STR,
        "counterargument_exists": BOOL,
    })

    async def attack(
        self, claim_text: str, verdict: Verdict, confidence: float,
        reasoning: str, evidence: list[Evidence],
    ) -> dict[str, Any]:
        summary = "\n".join(
            f"[{i}] {e.relationship.value} | quality {e.quality_score} | {e.title} "
            f"({e.publisher or 'unknown'}) -- {e.why_it_matters}"
            for i, e in enumerate(evidence[:12])
        ) or "(no evidence was retrieved)"

        prompt = (
            f"CLAIM: {claim_text}\n\n"
            f"VERDICT TO ATTACK: {verdict.value} at {confidence:.0%} confidence\n\n"
            f"THE REASONING BEHIND IT:\n{reasoning}\n\n"
            f"EVIDENCE IT RESTS ON:\n{summary}\n\n"
            "Build the strongest honest case that this verdict is wrong, and "
            "plan the searches that would prove it. Return JSON only."
        )
        return await self.run(prompt)


class DevilsAdvocateAdjudicate(Agent):
    name = "devils_advocate_adjudicate"
    schema_name = "adjudication"
    max_tokens = 2400
    role = """
A counterargument was raised against a verdict, and a fresh adversarial
search was run to find evidence for it. Judge honestly whether the new
evidence overturns the verdict.

Three outcomes are all legitimate:
- The verdict stands. The counterargument was considered and the new evidence
  does not carry it. Say exactly why it falls short.
- The verdict shifts. The new evidence genuinely changes the picture. Move it
  and say what did the work.
- Confidence moves but the verdict does not. Common and honest: the
  counterargument has real force without being decisive.

Guard against two opposite failures. Do not defend the original verdict out
of consistency. Do not overturn it just to look even-handed. The evidence
decides.

The magnitude test still governs. A study showing a real but much smaller
effect does not rescue a claim about a huge one.

Produce:
assessment: 50 to 110 words judging the counterargument against the new
evidence. Reference new sources by number, like [2].
final_verdict, final_confidence (0 to 1), verdict_changed.
what_would_change_our_mind: one concrete sentence naming the evidence that
would genuinely overturn the standing verdict. Never "more research".
"""
    schema = obj({
        "assessment": STR,
        "final_verdict": enum(
            "SUPPORTED", "PARTIALLY_SUPPORTED", "MISLEADING",
            "CONTRADICTED", "INCONCLUSIVE",
        ),
        "final_confidence": NUM,
        "verdict_changed": BOOL,
        "counterargument_strength": enum("weak", "moderate", "strong", "decisive"),
        "what_would_change_our_mind": STR,
        "strongest_new_evidence_indices": arr(NUM, max_items=3),
    })

    async def adjudicate(
        self, claim_text: str, verdict: Verdict, confidence: float,
        counterargument: str, new_evidence: list[Evidence],
        original_evidence: list[Evidence],
    ) -> dict[str, Any]:
        def render(items: list[Evidence], offset: int = 0) -> str:
            if not items:
                return "(none found)"
            return "\n".join(
                f"[{i + offset}] {e.relationship.value} | quality {e.quality_score}"
                f"/100 | relevance {e.relevance_score}/100 | {e.title} "
                f"({e.publisher or 'unknown'}, {e.published_at or 'undated'})"
                f"\n     {e.why_it_matters}"
                for i, e in enumerate(items)
            )

        prompt = (
            f"CLAIM: {claim_text}\n\n"
            f"STANDING VERDICT: {verdict.value} at {confidence:.0%} confidence\n\n"
            f"COUNTERARGUMENT RAISED:\n{counterargument}\n\n"
            f"NEW EVIDENCE FROM THE ADVERSARIAL SEARCH:\n{render(new_evidence)}\n\n"
            f"EVIDENCE THE ORIGINAL VERDICT RESTED ON:\n"
            f"{render(original_evidence[:8], offset=100)}\n\n"
            "Judge the counterargument against the new evidence. Return JSON only."
        )
        return await self.run(prompt)
