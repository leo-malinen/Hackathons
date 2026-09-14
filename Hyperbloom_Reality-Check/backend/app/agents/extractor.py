"""Agent 1, the Claim Extractor, plus the Claim Normalizer.

PRD sections 10 to 12. Splits submitted content into atomic, independently
checkable claims, classifies each one, then converts the checkable ones into
a structured representation that searches better than raw prose.
"""
from __future__ import annotations

from typing import Any

from ..schemas import Claim, ClaimType, NormalizedClaim
from ..security.sanitize import fence
from .base import BOOL, INT, NUM, STR, Agent, arr, enum, obj
from ..retrieval.base import stable_id


class ClaimExtractor(Agent):
    name = "claim_extractor"
    schema_name = "extracted_claims"
    max_tokens = 3000
    role = """
You break submitted content into ATOMIC factual claims.

An atomic claim asserts exactly one checkable thing. Split compound
statements. "A new study proves AI makes people less creative, testing 10,000
people and finding a 45% decline" is four claims: that a study exists, that it
showed AI reduces creativity, that 10,000 people were tested, and that the
decline was 45%.

Classify every statement:
  FACTUAL         a checkable assertion about the world
  OPINION         a preference or aesthetic judgement
  PREDICTION      an assertion about the future
  VALUE_JUDGMENT  a moral or normative claim
  UNVERIFIABLE    factual in form but impossible to check in practice

Rules:
- Rewrite each claim to stand alone. Resolve pronouns. Keep the original
  meaning and the original magnitude exactly. Never soften or strengthen it.
- Do not invent claims the content does not make.
- Implicit claims count. "Stop wasting money on X, it does nothing" asserts
  that X does nothing.
- checkworthiness 0 to 1: how much a reader's understanding depends on this
  claim being right. The headline number of a viral post is high. An
  incidental date is low.
- Return at most 8 claims, ordered by checkworthiness, highest first.
"""
    schema = obj({
        "claims": arr(obj({
            "text": STR,
            "type": enum("FACTUAL", "OPINION", "PREDICTION", "VALUE_JUDGMENT", "UNVERIFIABLE"),
            "rationale": STR,
            "checkworthiness": NUM,
        }), max_items=8),
        "content_summary": STR,
        "detected_language": STR,
    })

    async def extract(self, content: str, *, source_url: str | None = None) -> dict[str, Any]:
        prompt = (
            "Extract and classify the atomic claims in the following submitted "
            "content.\n\n"
            f"{fence(content, label='USER_SUBMITTED_CONTENT')}\n\n"
            + (f"Submitted from URL: {source_url}\n" if source_url else "")
            + "\nreturn JSON only."
        )
        return await self.run(prompt)


class ClaimNormalizer(Agent):
    name = "claim_normalizer"
    schema_name = "normalized_claims"
    max_tokens = 2600
    role = """
You convert natural-language claims into a structured representation so they
can be searched and compared precisely.

For each claim fill: subject, predicate, object, magnitude, population,
time_period, location, source_cited. Use null for anything the claim does not
state. Never guess a value the claim does not contain: a missing population
is itself important information, because a claim that omits its population is
weaker than one that names it.

specificity, 0 to 1: how pinned-down the claim is. "Coffee increases lifespan
by exactly 20% in adults over 50" is near 1. "Coffee is good for you" is near
0.15. Vague claims cannot be confidently verified, so this number matters.
"""
    schema = obj({
        "normalized": arr(obj({
            "index": INT,
            "subject": STR,
            "predicate": STR,
            "object": STR,
            "magnitude": STR,
            "population": STR,
            "time_period": STR,
            "location": STR,
            "source_cited": STR,
            "specificity": NUM,
        })),
    })

    async def normalize(self, claims: list[Claim]) -> dict[str, Any]:
        listing = "\n".join(f"[{i}] {c.text}" for i, c in enumerate(claims))
        prompt = (
            "Normalize each claim below. Use the empty string for fields the "
            "claim does not state.\n\n"
            f"{listing}\n\nReturn one entry per claim, matching by index."
        )
        return await self.run(prompt)


# --------------------------------------------------------------------------
def build_claims(payload: dict[str, Any]) -> list[Claim]:
    claims: list[Claim] = []
    for index, raw in enumerate(payload.get("claims") or []):
        text = (raw.get("text") or "").strip()
        if not text:
            continue
        try:
            claim_type = ClaimType(raw.get("type", "FACTUAL"))
        except ValueError:
            claim_type = ClaimType.FACTUAL
        try:
            checkworthiness = float(raw.get("checkworthiness", 0.5))
        except (TypeError, ValueError):
            checkworthiness = 0.5
        claims.append(
            Claim(
                id=stable_id("claim", text, str(index)),
                text=text,
                type=claim_type,
                rationale=(raw.get("rationale") or "").strip(),
                checkworthiness=max(0.0, min(1.0, checkworthiness)),
            )
        )
    return claims


def _clean(value: Any) -> str | None:
    text = (value or "").strip() if isinstance(value, str) else None
    if not text or text.lower() in ("null", "none", "n/a", "unspecified", "not stated"):
        return None
    return text


def apply_normalization(claims: list[Claim], payload: dict[str, Any]) -> None:
    by_index = {}
    for entry in payload.get("normalized") or []:
        try:
            by_index[int(entry.get("index", -1))] = entry
        except (TypeError, ValueError):
            continue

    for index, claim in enumerate(claims):
        entry = by_index.get(index)
        if not entry:
            continue
        try:
            specificity = float(entry.get("specificity", 0.5))
        except (TypeError, ValueError):
            specificity = 0.5
        claim.normalized = NormalizedClaim(
            subject=_clean(entry.get("subject")),
            predicate=_clean(entry.get("predicate")),
            object=_clean(entry.get("object")),
            magnitude=_clean(entry.get("magnitude")),
            population=_clean(entry.get("population")),
            time_period=_clean(entry.get("time_period")),
            location=_clean(entry.get("location")),
            source_cited=_clean(entry.get("source_cited")),
            specificity=max(0.0, min(1.0, specificity)),
        )
