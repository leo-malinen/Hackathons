"""The Change Impact Record written back into DataHub.

This is the artifact that makes the catalog smarter with every PR: what
changed, who owns the affected assets, which models were at risk, what the
firewall decided, and a link back to the pull request. The next person - or
the next agent - inherits this instead of rediscovering it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from ..context.base import BI_TYPES, ML_TYPES, PIPELINE_TYPES
from ..lineage import describe_path
from ..state import BlastRadiusState


def render_change_impact_record(state: BlastRadiusState, settings) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ranked = sorted(state.impacted, key=lambda i: -i.score)
    labels = {i.entity.urn: i.entity.short_name for i in state.impacted}
    for asset in state.changed_assets:
        if asset.urn:
            labels.setdefault(asset.urn, asset.name)

    def label(urn: str) -> str:
        return labels.get(urn, urn.split(":")[-1])

    lines: List[str] = []
    lines.append("# Change Impact Record")
    lines.append("")
    lines.append("| | |")
    lines.append("|---|---|")
    lines.append("| Verdict | **%s** (score %.1f) |" % (state.severity, state.score))
    lines.append("| Analysed | %s |" % now)
    lines.append("| Pull request | %s |" % (settings.pr_url() or "local run"))
    lines.append("| Repository | %s |" % (settings.github_repository or "n/a"))
    lines.append("| Metadata source | %s |" % (state.context_source or "unknown"))
    lines.append("| Downstream assets | %d |" % len(state.impacted))
    if state.monthly_cost_at_risk:
        lines.append("| Monthly compute at risk | $%s |" % format(int(state.monthly_cost_at_risk), ","))
    lines.append("")

    if state.headline:
        lines.append("> %s" % state.headline)
        lines.append("")
    if state.narrative:
        lines.append(state.narrative)
        lines.append("")

    # What changed -------------------------------------------------------
    lines.append("## What changed")
    lines.append("")
    if state.changed_assets:
        for asset in state.changed_assets:
            lines.append(
                "- **%s** (`%s`, %s) - URN resolved by *%s*"
                % (asset.name, asset.path, asset.asset_type, asset.urn_confidence)
            )
            for change in asset.changes:
                lines.append(
                    "    - %s %s"
                    % (
                        "**BREAKING**" if change.is_breaking else "non-breaking",
                        change.describe(),
                    )
                )
                if change.old_expression and change.new_expression:
                    lines.append("        - before: `%s`" % change.old_expression[:200])
                    lines.append("        - after: `%s`" % change.new_expression[:200])
    else:
        lines.append("- no structural changes detected")
    lines.append("")

    # Who is affected ----------------------------------------------------
    lines.append("## Who is affected")
    lines.append("")
    if ranked:
        lines.append("| Asset | Type | Hops | Owners | Usage (30d) | Score |")
        lines.append("|---|---|---|---|---|---|")
        for item in ranked[:25]:
            entity = item.entity
            usage = (
                format(item.usage.total_queries, ",") + " queries"
                if item.usage.total_queries
                else (
                    format(entity.requests_per_day, ",") + " req/day"
                    if entity.requests_per_day
                    else "-"
                )
            )
            lines.append(
                "| %s | %s | %d | %s | %s | %.1f |"
                % (
                    entity.short_name,
                    entity.entity_type,
                    item.hops,
                    ", ".join(entity.owners[:2]) or "**unowned**",
                    usage,
                    item.score,
                )
            )
    else:
        lines.append("No downstream assets found in the catalog.")
    lines.append("")

    # ML exposure ---------------------------------------------------------
    ml = [i for i in ranked if i.entity.entity_type in ML_TYPES]
    if ml:
        lines.append("## Models at risk")
        lines.append("")
        for item in ml:
            entity = item.entity
            suffix = ""
            if entity.requests_per_day:
                suffix = " serving %s req/day" % format(entity.requests_per_day, ",")
            lines.append("- **%s** (%s)%s" % (entity.short_name, entity.entity_type, suffix))
            path = item.best_path()
            if path:
                lines.append("    - path: `%s`" % describe_path(path, label))
                transforms = [e.transform for e in path.edges if e.transform]
                if transforms:
                    lines.append("    - transform: `%s`" % transforms[0][:220])
        lines.append("")

    # Decision -------------------------------------------------------------
    lines.append("## Decision taken")
    lines.append("")
    fail_on = settings.fail_on
    from ..severity import severity_at_least

    if severity_at_least(state.severity, fail_on):
        lines.append(
            "- Merge **blocked** by the Blast Radius status check (threshold: %s)." % fail_on
        )
    else:
        lines.append("- Merge **allowed**; findings posted to the pull request for review.")
    if state.artifacts:
        lines.append("- Remediation code generated:")
        for artifact in state.artifacts:
            lines.append("    - `%s` - %s" % (artifact.path, artifact.purpose))
    else:
        lines.append("- No remediation code was required at this severity.")
    lines.append("")

    # Method ----------------------------------------------------------------
    stats = state.traversal_stats or {}
    lines.append("## How this was computed")
    lines.append("")
    lines.append(
        "- Deterministic column-level BFS over DataHub lineage: %s seed(s), %s node(s) visited, "
        "%s edge(s) walked, max %s hops."
        % (
            stats.get("seeds", 0),
            stats.get("visited", 0),
            stats.get("edges", 0),
            stats.get("max_hops", 0),
        )
    )
    lines.append(
        "- Column-level lineage was %s for this change."
        % ("available" if stats.get("column_level") else "not available (table-level fallback)")
    )
    lines.append(
        "- Severity is rule-based, not model-generated. The LLM wrote only the narrative "
        "and refined the generated code."
    )
    lines.append("")
    lines.append("---")
    lines.append("*Written back to DataHub by Blast Radius, the pre-merge Data Change Firewall.*")
    return "\n".join(lines)
