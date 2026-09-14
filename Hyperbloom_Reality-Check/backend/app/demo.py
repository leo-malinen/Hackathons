"""The demo set from PRD sections 44 and 45.

Deliberately spans every verdict band. A fact checker that returns FALSE for
everything is not a fact checker, and the fastest way to show a judge that
Reality Check actually reads evidence is to have it disagree with itself
across these five.

expected_band is the band we anticipate, never a hardcoded answer. Each of
these runs the full pipeline live, and the system is free to disagree.
"""
from __future__ import annotations

DEMO_CLAIMS: list[dict[str, str]] = [
    {
        "id": "brains",
        "label": "Clearly false",
        "text": "Humans only use 10% of their brains.",
        "expected_band": "CONTRADICTED",
        "why": "A textbook myth with abundant imaging evidence against it.",
    },
    {
        "id": "carrots",
        "label": "Misleading",
        "text": "Eating carrots dramatically improves your night vision.",
        "expected_band": "MISLEADING",
        "why": (
            "Built on a real nutrient and a wartime propaganda campaign. "
            "Technically rooted in fact, wildly overstated in effect."
        ),
    },
    {
        "id": "coffee",
        "label": "Partially supported",
        "text": "Scientists have proven that drinking coffee increases lifespan by 20%.",
        "expected_band": "PARTIALLY_SUPPORTED or MISLEADING",
        "why": (
            "Large cohort studies do find an association with lower mortality, "
            "but not proof, not causation, and not 20%."
        ),
    },
    {
        "id": "lightning",
        "label": "Clearly false",
        "text": "Lightning never strikes the same place twice.",
        "expected_band": "CONTRADICTED",
        "why": "Directly refuted by observational records and physics.",
    },
    {
        "id": "goldfish",
        "label": "Contradicted",
        "text": "Goldfish have a three-second memory.",
        "expected_band": "CONTRADICTED",
        "why": "Behavioural studies show retention over weeks to months.",
    },
    {
        "id": "supplement",
        "label": "Misleading, viral style",
        "text": (
            "BREAKING: A new clinical study proves this natural supplement "
            "increases testosterone by 400% in just two weeks."
        ),
        "expected_band": "MISLEADING or INCONCLUSIVE",
        "why": (
            "The viral-marketing shape the product was built for. Tests whether "
            "the system separates a real mechanism from an invented magnitude."
        ),
    },
    {
        "id": "ai-creativity",
        "label": "Misleading, the demo hook",
        "text": (
            "BREAKING: Scientists prove that AI reduces human creativity by 40%."
        ),
        "expected_band": "MISLEADING or INCONCLUSIVE",
        "why": (
            "The PRD's own demo claim. Real research exists on AI and divergent "
            "thinking, with nothing establishing proof or that figure."
        ),
    },
    {
        "id": "opinion",
        "label": "Not checkable",
        "text": "Honestly, this is the worst AI product ever made.",
        "expected_band": "NOT_CHECKABLE",
        "why": (
            "Shows the system declining to fact check an opinion instead of "
            "forcing it into a true or false box."
        ),
    },
]
