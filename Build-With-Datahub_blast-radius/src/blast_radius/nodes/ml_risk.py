"""[3] ML Risk Agent.

Filters the impact set down to the ML surface (MLFeature / MLPrimaryKey /
MLFeatureTable / MLModel / MLModelDeployment), applies the deterministic
severity rubric, and asks the LLM for exactly one thing: a two-sentence
narrative a human can act on.

If the LLM is unavailable the narrative is generated from a template and the
verdict is byte-for-byte identical. Severity is never LLM-decided.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from ..lineage import describe_path
from ..context import pretty_urn
from ..severity import roll_up
from ..state import ImpactedAsset

SYSTEM = (
    "You are the ML Risk Agent inside a pre-merge data-change firewall. "
    "You are given a FACTUAL, already-computed impact analysis derived from a "
    "metadata graph. Never invent assets, columns, models or numbers that are "
    "not in the input. Never contradict the supplied severity. "
    "Write for a senior data engineer reading a pull request comment: direct, "
    "specific, no hedging, no bullet lists, no preamble."
)


def _headline(state, impacted: List[ImpactedAsset]) -> str:
    """The one-line summary. Deterministic, always correct."""
    dashboards = [i for i in impacted if i.entity.entity_type == "dashboard"]
    jobs = [i for i in impacted if i.entity.entity_type in ("dataJob", "dataFlow")]
    models = [i for i in impacted if i.entity.entity_type == "mlModel"]
    deployments = [i for i in impacted if i.entity.entity_type == "mlModelDeployment"]
    features = [i for i in impacted if i.entity.entity_type == "mlFeature"]
    datasets = [i for i in impacted if i.entity.entity_type == "dataset"]

    bits: List[str] = []
    if dashboards:
        bits.append(f"{len(dashboards)} dashboard{'s' if len(dashboards) != 1 else ''}")
    if jobs:
        bits.append(f"{len(jobs)} Airflow job{'s' if len(jobs) != 1 else ''}")
    if datasets:
        bits.append(f"{len(datasets)} downstream table{'s' if len(datasets) != 1 else ''}")

    prefix = "This breaks " + ", ".join(bits) if bits else "This change reaches downstream assets"

    if models:
        model = max(models, key=lambda i: i.score or 0)
        via = ""
        if features:
            feature = max(features, key=lambda i: i.score or 0)
            via = f" via feature `{feature.entity.short_name}`"
        serving = ""
        if deployments:
            dep = max(deployments, key=lambda i: i.entity.requests_per_day)
            rpd = dep.entity.requests_per_day
            if rpd:
                serving = f" serving {rpd:,} req/day"
        return (
            f"{prefix}, and - critically - `{model.entity.short_name}`, "
            f"a production ML model{serving}{via}."
        )

    if not bits:
        return "No downstream assets are affected by this change."
    return prefix + "."


def _template_narrative(state, impacted: List[ImpactedAsset], severity: str, escalations) -> str:
    if not impacted:
        return (
            "No catalogued asset consumes the changed columns. Either this model is "
            "genuinely a leaf, or its lineage has not been ingested into DataHub yet."
        )
    top = sorted(impacted, key=lambda i: -i.score)[:3]
    names = ", ".join(f"`{i.entity.short_name}`" for i in top)
    reason = escalations[0] if escalations else f"{len(impacted)} downstream assets are affected"
    return (
        f"Severity {severity} because {reason}. The highest-scoring assets are {names}. "
        "Review the lineage path below before merging; the generated migration makes the "
        "change backward compatible."
    )


def _llm_payload(state, impacted: List[ImpactedAsset], severity: str, score: float) -> str:
    changes = [c.to_dict() for c in state.all_changes][:20]
    assets = []
    for i in sorted(impacted, key=lambda x: -x.score)[:12]:
        best = i.best_path()
        assets.append(
            {
                "name": i.entity.short_name,
                "type": i.entity.entity_type,
                "tier": i.entity.tier,
                "certified": i.entity.certified,
                "owners": i.entity.owners[:3],
                "hops": i.hops,
                "impacted_columns": i.impacted_columns,
                "queries_30d": i.usage.total_queries,
                "requests_per_day": i.entity.requests_per_day or None,
                "path": describe_path(best, pretty_urn) if best else "",
            }
        )
    return json.dumps(
        {
            "severity": severity,
            "score": round(score, 1),
            "changes": changes,
            "impacted": assets,
        },
        indent=2,
    )[:12000]


def score_ml_risk(state, deps) -> Dict[str, Any]:
    policy = deps.settings.section("severity")
    verdict = roll_up(state.impacted, state.all_changes, policy)

    severity = verdict["severity"]
    score = verdict["score"]
    escalations = verdict["escalations"]

    ml_assets = [i for i in state.impacted if i.entity.is_ml]
    cost = sum(i.entity.monthly_cost_usd for i in state.impacted)

    headline = _headline(state, state.impacted)
    narrative = _template_narrative(state, state.impacted, severity, escalations)

    if deps.llm.available and state.impacted:
        user = (
            "Impact analysis (ground truth, do not contradict):\n"
            f"{_llm_payload(state, state.impacted, severity, score)}\n\n"
            "Write 2-3 sentences explaining WHY this severity is correct and what the "
            "reviewer should do. Mention the single most important downstream asset by "
            "name and the mechanism (which column flows into it). "
            "Plain prose only, no markdown headings, no lists."
        )
        generated = deps.llm.complete(SYSTEM, user, max_tokens=400)
        if generated and generated.strip():
            narrative = generated.strip()

    return {
        "severity": severity,
        "score": score,
        "ml_assets": ml_assets,
        "headline": headline,
        "narrative": narrative,
        "monthly_cost_at_risk": cost,
    }
