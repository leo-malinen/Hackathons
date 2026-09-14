"""Verdict and confidence computation (PRD sections 18 and 19).

Why this is arithmetic rather than a model judgement: a language model asked
"how confident are you" produces a number shaped by tone, not by evidence. So
the engine computes the verdict from evidence mass, and the Reasoner agent is
allowed to shade it only within declared bounds, and only with a reason.

The central mechanic is cluster-weighting. Evidence is aggregated per source
cluster, not per document, so ten syndicated copies of one study contribute
roughly what one study contributes. That is the whole point of section 16.

Confidence is confidence in the *assessment*, not the probability that the
claim is true. An INCONCLUSIVE verdict can be held with high confidence when
we are sure the evidence is genuinely insufficient.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..schemas import Evidence, Relationship, Verdict

# Below this much effective evidence, nothing can be concluded.
MIN_MASS_FOR_VERDICT = 0.55
# Below this many genuinely independent clusters, confidence is capped.
MIN_CLUSTERS_FOR_CONFIDENCE = 3


@dataclass
class VerdictComputation:
    verdict: Verdict
    confidence: float
    support_mass: float = 0.0
    contradict_mass: float = 0.0
    context_mass: float = 0.0
    total_mass: float = 0.0
    support_ratio: float = 0.5
    independent_clusters: int = 0
    mean_quality: float = 0.0
    drivers: list[str] = field(default_factory=list)
    caps_applied: list[str] = field(default_factory=list)


def _document_weight(item: Evidence) -> float:
    """A single document's pull, before cluster de-duplication."""
    quality = item.quality_score / 100.0
    relevance = item.relevance_score / 100.0
    stance = 0.45 + 0.55 * item.stance_confidence
    weight = quality * relevance * stance
    if item.injection_flagged:
        # A page trying to manipulate the checker has forfeited its credibility.
        weight *= 0.25
    return round(weight, 4)


def compute(
    evidence: list[Evidence],
    *,
    claim_specificity: float = 0.5,
    overstates_evidence: bool = False,
    cherry_picked_magnitude: bool = False,
) -> VerdictComputation:
    """Fold evidence into a verdict and a confidence figure."""
    usable = [
        e for e in evidence
        if e.relationship is not Relationship.IRRELEVANT and e.relevance_score >= 25
    ]

    for item in usable:
        item.effective_weight = _document_weight(item)

    if not usable:
        return VerdictComputation(
            verdict=Verdict.INCONCLUSIVE,
            confidence=0.55,
            drivers=["No relevant evidence was retrieved."],
        )

    # --- aggregate per cluster, not per document -------------------------
    clusters: dict[str, list[Evidence]] = {}
    for item in usable:
        clusters.setdefault(item.cluster_id or item.id, []).append(item)

    support = contradict = context = 0.0
    for members in clusters.values():
        # A cluster speaks with its strongest voice, plus a small echo credit
        # so a genuinely large body of work still outweighs a lone paper.
        by_stance: dict[Relationship, list[float]] = {}
        for member in members:
            by_stance.setdefault(member.relationship, []).append(member.effective_weight)

        for stance, weights in by_stance.items():
            weights.sort(reverse=True)
            mass = weights[0] + sum(w * 0.18 for w in weights[1:])
            if stance is Relationship.SUPPORTS:
                support += mass
            elif stance is Relationship.CONTRADICTS:
                contradict += mass
            elif stance is Relationship.CONTEXTUALIZES:
                context += mass

    # Contextualising evidence is normally neutral: it reframes rather than
    # settles. But once the Reasoner has found that the claim overstates what
    # its own evidence showed, sources that report a real-but-smaller effect
    # stop being neutral. They are precisely what refutes the overstatement.
    # Without this, a claim like "coffee increases lifespan by 20%" retrieves a
    # dozen studies reporting a modest mortality association, every one of them
    # lands as CONTEXTUALIZES, and the engine calls it INCONCLUSIVE when the
    # honest answer is MISLEADING.
    context_turned = 0.0
    if (overstates_evidence or cherry_picked_magnitude) and context > 0:
        context_turned = context * 0.6
        contradict += context_turned

    decisive = support + contradict
    total = support + contradict + context - context_turned
    independent_clusters = len(clusters)
    mean_quality = sum(e.quality_score for e in usable) / len(usable)

    drivers: list[str] = []
    caps: list[str] = []
    if context_turned:
        drivers.append(
            "Sources reporting a real but smaller effect were counted against the "
            "claim, because the claim overstates what they found."
        )

    # --- verdict ---------------------------------------------------------
    if total < MIN_MASS_FOR_VERDICT:
        verdict = Verdict.INCONCLUSIVE
        ratio = 0.5
        drivers.append("Retrieved evidence was too thin to support any conclusion.")
    elif decisive < 0.3 and context > 0:
        verdict = Verdict.INCONCLUSIVE
        ratio = 0.5
        drivers.append(
            "Sources add context but none directly confirm or refute the claim."
        )
    else:
        ratio = support / decisive if decisive > 0 else 0.5

        if ratio >= 0.82:
            verdict = Verdict.SUPPORTED
        elif ratio >= 0.60:
            verdict = Verdict.PARTIALLY_SUPPORTED
        elif ratio >= 0.34:
            verdict = Verdict.MISLEADING
        elif ratio >= 0.15:
            verdict = Verdict.MISLEADING
        else:
            verdict = Verdict.CONTRADICTED

        drivers.append(
            f"Independent evidence weight ran {support:.2f} supporting against "
            f"{contradict:.2f} contradicting across {independent_clusters} "
            f"independent source group(s)."
        )

        # A claim whose parts are real but whose headline number is not is the
        # textbook MISLEADING case from the PRD.
        if overstates_evidence and verdict in (
            Verdict.SUPPORTED, Verdict.PARTIALLY_SUPPORTED
        ):
            verdict = Verdict.MISLEADING
            drivers.append(
                "The underlying finding is real but the claim overstates what it showed."
            )
        if cherry_picked_magnitude and verdict is Verdict.SUPPORTED:
            verdict = Verdict.PARTIALLY_SUPPORTED
            drivers.append("The specific magnitude claimed is not what the evidence shows.")

        # Turned context proves overstatement, not falsity. A claim whose only
        # opposition is "the real effect is smaller than you said" is
        # MISLEADING; reserve CONTRADICTED for evidence that directly conflicts.
        if verdict is Verdict.CONTRADICTED and context_turned > 0:
            native_contradiction = contradict - context_turned
            if native_contradiction < context_turned:
                verdict = Verdict.MISLEADING
                drivers.append(
                    "Graded as misleading rather than contradicted: the evidence "
                    "shows a real effect that the claim overstates, rather than "
                    "directly refuting it."
                )

        # Strongly split high-quality evidence is a genuine disagreement.
        if 0.42 <= ratio <= 0.58 and independent_clusters >= 4 and mean_quality >= 68:
            verdict = Verdict.INCONCLUSIVE
            drivers.append(
                "Reliable sources genuinely disagree, so no confident verdict is available."
            )

    # --- confidence ------------------------------------------------------
    # Each factor sits in 0..1 and multiplies a 0.97 ceiling.
    mass_factor = min(1.0, total / 3.2) ** 0.62
    cluster_factor = min(1.0, independent_clusters / 6.0) ** 0.55
    quality_factor = 0.45 + 0.55 * (mean_quality / 100.0)

    if verdict is Verdict.INCONCLUSIVE:
        # Confidence that we cannot tell grows with how hard we looked.
        agreement_factor = 0.62 + 0.28 * min(1.0, independent_clusters / 6.0)
    else:
        # Lopsided evidence is easy to read; a near-even split is not.
        agreement_factor = 0.40 + 0.60 * abs(ratio - 0.5) * 2

    specificity_factor = 0.72 + 0.28 * claim_specificity

    confidence = (
        0.97
        * mass_factor
        * cluster_factor
        * quality_factor
        * agreement_factor
        * specificity_factor
    )

    # --- honesty caps ----------------------------------------------------
    if independent_clusters < MIN_CLUSTERS_FOR_CONFIDENCE:
        confidence = min(confidence, 0.62)
        caps.append(
            f"Capped: only {independent_clusters} independent source group(s) found."
        )
    if mean_quality < 55:
        confidence = min(confidence, 0.68)
        caps.append("Capped: average source quality is moderate.")
    if total < 1.2:
        confidence = min(confidence, 0.58)
        caps.append("Capped: total evidence weight is low.")
    if any(e.injection_flagged for e in usable):
        confidence = min(confidence, 0.80)
        caps.append("Capped: at least one source attempted prompt injection.")

    confidence = max(0.12, min(0.97, confidence))

    return VerdictComputation(
        verdict=verdict,
        confidence=round(confidence, 3),
        support_mass=round(support, 3),
        contradict_mass=round(contradict, 3),
        context_mass=round(context, 3),
        total_mass=round(total, 3),
        support_ratio=round(ratio, 3),
        independent_clusters=independent_clusters,
        mean_quality=round(mean_quality, 1),
        drivers=drivers,
        caps_applied=caps,
    )


# --------------------------------------------------------------------------
# Rolling a set of per-claim verdicts into one headline verdict.
# --------------------------------------------------------------------------
_SEVERITY = {
    Verdict.CONTRADICTED: 5,
    Verdict.MISLEADING: 4,
    Verdict.PARTIALLY_SUPPORTED: 3,
    Verdict.INCONCLUSIVE: 2,
    Verdict.SUPPORTED: 1,
    Verdict.NOT_CHECKABLE: 0,
}


def aggregate(
    per_claim: list[tuple[Verdict, float, float]]
) -> tuple[Verdict, float]:
    """Combine claim verdicts, weighted by checkworthiness.

    The worst substantiated finding leads, because a paragraph containing one
    contradicted claim is not neutralised by four true ones. Confidence is the
    weighted mean of the claims that actually drove the headline.
    """
    scored = [
        (verdict, confidence, weight)
        for verdict, confidence, weight in per_claim
        if verdict is not Verdict.NOT_CHECKABLE
    ]
    if not scored:
        return Verdict.NOT_CHECKABLE, 0.0

    # Only let a severe verdict lead if it was held with real confidence.
    def lead_rank(entry: tuple[Verdict, float, float]) -> tuple[int, float]:
        verdict, confidence, weight = entry
        credible = confidence >= 0.45
        return (_SEVERITY[verdict] if credible else 0, confidence * weight)

    headline_verdict = max(scored, key=lead_rank)[0]

    matching = [(c, w) for v, c, w in scored if v is headline_verdict]
    total_weight = sum(w for _, w in matching) or 1.0
    confidence = sum(c * w for c, w in matching) / total_weight

    return headline_verdict, round(max(0.12, min(0.97, confidence)), 3)
