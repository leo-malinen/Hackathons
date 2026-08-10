"""Severity scoring. Deterministic, explainable, tunable from blast-radius.yml.

The rubric answers one question: *how much real-world damage does this merge
do if nobody notices?* It deliberately ranks a production model deployment
above a certified dashboard above a dev scratch table, and it uses real query
volume rather than lineage edge count.

Every number that contributes to the score is attached to the asset as a
human-readable reason, so the PR comment can show its work.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence

from .state import ColumnChange, ImpactedAsset

SEVERITY_ORDER = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]

# What a downstream asset is worth, before modifiers.
BASE_WEIGHT: Dict[str, float] = {
    "mlModelDeployment": 40.0,
    "mlModel": 30.0,
    "mlFeature": 18.0,
    "mlPrimaryKey": 14.0,
    "mlFeatureTable": 12.0,
    "dashboard": 12.0,
    "dataJob": 10.0,
    "chart": 6.0,
    "dataFlow": 6.0,
    "dataset": 4.0,
}

# How dangerous each kind of change is.
CHANGE_WEIGHT: Dict[str, float] = {
    "drop": 1.0,
    "rename": 0.95,
    "type_change": 0.8,
    "nullability": 0.6,
    "expression_change": 0.5,
    "add": 0.15,
}

DEFAULT_BANDS = {"critical": 70.0, "high": 45.0, "medium": 20.0}


def severity_at_least(actual: str, threshold: str) -> bool:
    try:
        return SEVERITY_ORDER.index(actual) >= SEVERITY_ORDER.index(threshold)
    except ValueError:
        return False


def max_severity(a: str, b: str) -> str:
    return a if SEVERITY_ORDER.index(a) >= SEVERITY_ORDER.index(b) else b


def score_asset(
    impacted: ImpactedAsset,
    changes: Sequence[ColumnChange],
    policy: Dict[str, Any] | None = None,
) -> float:
    """Score a single impacted asset and record why."""
    policy = policy or {}
    entity = impacted.entity
    reasons: List[str] = []

    base = BASE_WEIGHT.get(entity.entity_type, 3.0)
    score = base
    reasons.append(f"{entity.entity_type} base {base:g}")

    # --- criticality of the asset itself -------------------------------
    tier = (entity.tier or "").lower()
    if "tier1" in tier or "tier_1" in tier:
        score *= 1.6
        reasons.append("Tier1 x1.6")
    elif "tier2" in tier or "tier_2" in tier:
        score *= 1.25
        reasons.append("Tier2 x1.25")
    if entity.certified:
        score *= 1.2
        reasons.append("certified x1.2")

    if entity.deprecated:
        mult = float(policy.get("deprecated_multiplier", 0.25))
        score *= mult
        reasons.append(f"deprecated x{mult:g}")

    # --- real-world usage ----------------------------------------------
    queries = impacted.usage.total_queries or entity.query_count_30d
    if queries:
        usage_mult = 1.0 + min(queries / 500.0, 1.0)
        score *= usage_mult
        reasons.append(f"{queries} queries/30d x{usage_mult:.2f}")

    rpd = entity.requests_per_day
    if rpd:
        serving_mult = 1.0 + min(rpd / 50000.0, 1.0)
        score *= serving_mult
        reasons.append(f"{rpd:,} req/day x{serving_mult:.2f}")

    # --- distance -------------------------------------------------------
    if impacted.hops > 1:
        decay = 1.0 / (1.0 + 0.15 * (impacted.hops - 1))
        score *= decay
        reasons.append(f"{impacted.hops} hops x{decay:.2f}")

    # --- how breaking is the change that reached it ---------------------
    relevant = impacted.triggering_changes or list(changes)
    change_mult = max((CHANGE_WEIGHT.get(c.kind, 0.4) for c in relevant), default=0.4)
    score *= change_mult
    kinds = ", ".join(sorted({c.kind for c in relevant})) or "change"
    reasons.append(f"{kinds} x{change_mult:g}")

    # --- ownership gap makes recovery slower ----------------------------
    if not entity.owners and entity.entity_type != "dataset":
        score *= 1.15
        reasons.append("unowned x1.15")

    impacted.reasons = reasons
    impacted.score = score
    return score


def roll_up(
    impacted: Sequence[ImpactedAsset],
    changes: Sequence[ColumnChange],
    policy: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Aggregate asset scores into a single severity verdict."""
    policy = policy or {}
    bands = {**DEFAULT_BANDS, **(policy.get("bands") or {})}

    total = 0.0
    for asset in impacted:
        total += score_asset(asset, changes, policy)
    total = min(100.0, total)

    breaking = [c for c in changes if c.is_breaking]
    severity = "NONE"
    escalations: List[str] = []

    if total >= float(bands["critical"]):
        severity = "CRITICAL"
    elif total >= float(bands["high"]):
        severity = "HIGH"
    elif total >= float(bands["medium"]):
        severity = "MEDIUM"
    elif total > 0:
        severity = "LOW"

    if breaking:
        # A breaking change that reaches a live model deployment is always
        # CRITICAL, regardless of arithmetic. This is the firewall rule.
        if policy.get("escalate_on_serving_ml_deployment", True):
            for a in impacted:
                if a.entity.entity_type == "mlModelDeployment" and a.entity.is_serving:
                    severity = "CRITICAL"
                    escalations.append(
                        f"live model deployment `{a.entity.short_name}` is in the blast radius"
                    )
                    break
        # Reaching a production model at all is at least HIGH.
        if any(a.entity.entity_type == "mlModel" for a in impacted):
            severity = max_severity(severity, "HIGH")
            escalations.append("a production ML model consumes the changed column")
        if policy.get("escalate_on_tier1", True):
            for a in impacted:
                t = (a.entity.tier or "").lower()
                if "tier1" in t or a.entity.certified:
                    severity = max_severity(severity, "HIGH")
                    escalations.append(
                        f"certified/Tier1 asset `{a.entity.short_name}` is in the blast radius"
                    )
                    break

    if not impacted:
        severity = "NONE" if not breaking else "LOW"

    return {
        "severity": severity,
        "score": total,
        "escalations": escalations,
        "bands": bands,
    }


BADGE = {
    "CRITICAL": ("\U0001f6d1", "CRITICAL", "red"),
    "HIGH": ("\u26a0\ufe0f", "HIGH", "orange"),
    "MEDIUM": ("\U0001f7e1", "MEDIUM", "yellow"),
    "LOW": ("\U0001f7e2", "LOW", "green"),
    "NONE": ("\u2705", "NO IMPACT", "brightgreen"),
}


def badge_markdown(severity: str, score: float) -> str:
    emoji, label, colour = BADGE.get(severity, BADGE["NONE"])
    safe = label.replace(" ", "%20")
    return (
        f"![blast radius: {label}]"
        f"(https://img.shields.io/badge/blast%20radius-{safe}%20({score:.0f}%2F100)-{colour})"
    )
