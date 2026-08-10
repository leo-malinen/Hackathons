"""The sticky PR comment.

This is the thing judges look at. It has to answer, in five seconds:
is this safe, what breaks, why do you believe that, and where is the fix.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from ..context.base import BI_TYPES, ML_TYPES, PIPELINE_TYPES
from ..lineage import describe_path
from ..severity import badge_markdown, severity_at_least
from ..state import BlastRadiusState
from .mermaid import render_mermaid

STICKY_MARKER = "<!-- blast-radius:sticky-comment -->"


def render_comment(state: BlastRadiusState, settings) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ranked = sorted(state.impacted, key=lambda i: -i.score)
    labels = {i.entity.urn: i.entity.short_name for i in state.impacted}
    for asset in state.changed_assets:
        if asset.urn:
            labels.setdefault(asset.urn, asset.name)

    def label(urn: str) -> str:
        return labels.get(urn, urn.split(":")[-1])

    blocked = severity_at_least(state.severity, settings.fail_on)
    lines: List[str] = [STICKY_MARKER, ""]

    # -- verdict ---------------------------------------------------------
    lines.append("## %s Blast Radius" % badge_markdown(state.severity, state.score))
    lines.append("")
    if state.headline:
        lines.append("**%s**" % state.headline)
        lines.append("")
    if blocked:
        lines.append(
            "> **Merge blocked.** Severity `%s` meets the firewall threshold `%s`. "
            "Land the generated migration first, or override with the `blast-radius:override` label."
            % (state.severity, settings.fail_on)
        )
    elif state.impacted:
        lines.append(
            "> Merge allowed. Downstream impact detected below - worth a look before you land it."
        )
    else:
        lines.append("> No downstream impact found in the DataHub context graph.")
    lines.append("")

    # -- headline counters -------------------------------------------------
    ml = [i for i in ranked if i.entity.entity_type in ML_TYPES]
    bi = [i for i in ranked if i.entity.entity_type in BI_TYPES]
    jobs = [i for i in ranked if i.entity.entity_type in PIPELINE_TYPES]
    datasets = [i for i in ranked if i.entity.entity_type == "dataset"]

    counters = []
    counters.append("`%d` downstream assets" % len(state.impacted))
    if ml:
        counters.append("`%d` ML entities" % len(ml))
    if bi:
        counters.append("`%d` BI assets" % len(bi))
    if jobs:
        counters.append("`%d` pipelines" % len(jobs))
    if datasets:
        counters.append("`%d` tables" % len(datasets))
    if state.monthly_cost_at_risk:
        counters.append("`$%s/mo` downstream compute" % format(int(state.monthly_cost_at_risk), ","))
    lines.append(" &nbsp;•&nbsp; ".join(counters))
    lines.append("")

    if state.narrative:
        lines.append(state.narrative)
        lines.append("")

    # -- the ML path, front and centre -------------------------------------
    models = [i for i in ml if i.entity.entity_type in ("mlModel", "mlModelDeployment")]
    if models:
        lines.append("### Production ML at risk")
        lines.append("")
        for item in models[:4]:
            entity = item.entity
            serving = (
                " — serving **%s req/day**" % format(entity.requests_per_day, ",")
                if entity.requests_per_day
                else ""
            )
            owners = ", ".join(entity.owners[:2]) or "**unowned**"
            lines.append("- **`%s`** (%s)%s — owner: %s" % (entity.short_name, entity.entity_type, serving, owners))
            path = item.best_path()
            if path:
                lines.append("  - path: `%s`" % describe_path(path, label))
                transforms = [e.transform for e in path.edges if e.transform]
                if transforms:
                    lines.append("  - transform: `%s`" % transforms[0][:200])
        lines.append("")

    # -- what changed -------------------------------------------------------
    lines.append("### What changed")
    lines.append("")
    if state.changed_assets:
        for asset in state.changed_assets:
            lines.append("- `%s` (%s)" % (asset.path, asset.asset_type))
            for change in asset.changes[:8]:
                marker = "**BREAKING**" if change.is_breaking else "non-breaking"
                lines.append("  - %s — %s" % (marker, change.describe()))
            if asset.urn_confidence == "unresolved":
                lines.append("  - could not resolve this file to a DataHub URN, so it was not traversed")
    else:
        lines.append("- no structural data changes detected in this diff")
    lines.append("")

    # -- impact table --------------------------------------------------------
    if ranked:
        lines.append("### Downstream impact")
        lines.append("")
        lines.append("| Asset | Type | Hops | Owner | Real usage | Score |")
        lines.append("|---|---|---:|---|---|---:|")
        for item in ranked[:15]:
            entity = item.entity
            if item.usage.total_queries:
                usage = "%s queries/30d" % format(item.usage.total_queries, ",")
            elif entity.requests_per_day:
                usage = "%s req/day" % format(entity.requests_per_day, ",")
            else:
                usage = "—"
            flags = ""
            if entity.certified:
                flags += " ✅"
            if entity.tier:
                flags += " `%s`" % entity.tier
            if entity.deprecated:
                flags += " *(deprecated)*"
            lines.append(
                "| `%s`%s | %s | %d | %s | %s | %.1f |"
                % (
                    entity.short_name,
                    flags,
                    entity.entity_type,
                    item.hops,
                    ", ".join(entity.owners[:2]) or "**unowned**",
                    usage,
                    item.score,
                )
            )
        if len(ranked) > 15:
            lines.append("")
            lines.append("_...and %d more._" % (len(ranked) - 15))
        lines.append("")

    # -- diagram --------------------------------------------------------------
    diagram = render_mermaid(state)
    if diagram:
        lines.append("<details><summary><b>Lineage diagram</b></summary>")
        lines.append("")
        lines.append("```mermaid")
        lines.append(diagram)
        lines.append("```")
        lines.append("")
        lines.append("</details>")
        lines.append("")

    # -- generated fix ---------------------------------------------------------
    if state.artifacts:
        lines.append("### Generated remediation")
        lines.append("")
        lines.append(
            "Grounded in the live catalog schema (`list_schema_fields`), not guessed:"
        )
        lines.append("")
        for artifact in state.artifacts:
            lines.append("- `%s` — %s _(%s)_" % (artifact.path, artifact.purpose, artifact.generated_by))
        lines.append("")
        first = state.artifacts[0]
        lines.append("<details><summary><b>Preview: %s</b></summary>" % first.path)
        lines.append("")
        lines.append("```%s" % first.language)
        lines.append(first.content[:2400])
        lines.append("```")
        lines.append("")
        lines.append("</details>")
        lines.append("")

    # -- writeback -------------------------------------------------------------
    if state.writebacks:
        ok = [w for w in state.writebacks if w.ok]
        lines.append("### Written back to DataHub")
        lines.append("")
        lines.append(
            "The catalog is smarter than it was before this PR — the next person, "
            "or the next agent, inherits this analysis."
        )
        lines.append("")
        for record in ok[:10]:
            lines.append("- `%s` — %s" % (record.action, record.detail or record.target))
        failed = [w for w in state.writebacks if not w.ok]
        if failed:
            lines.append("")
            lines.append("<details><summary>%d writeback(s) skipped</summary>" % len(failed))
            lines.append("")
            for record in failed[:8]:
                lines.append("- `%s` on %s — %s" % (record.action, record.target, record.error or record.detail))
            lines.append("")
            lines.append("</details>")
        if state.document_url:
            lines.append("")
            lines.append("**Change Impact Record:** %s" % state.document_url)
        lines.append("")

    # -- method ------------------------------------------------------------------
    stats = state.traversal_stats or {}
    lines.append("<details><summary><b>How this was computed</b></summary>")
    lines.append("")
    lines.append(
        "- Deterministic column-level BFS over the DataHub lineage graph: "
        "**%s** seeds, **%s** nodes visited, **%s** edges walked, max **%s** hops."
        % (stats.get("seeds", 0), stats.get("visited", 0), stats.get("edges", 0), stats.get("max_hops", 0))
    )
    lines.append(
        "- Column-level lineage: **%s**."
        % ("used" if stats.get("column_level") else "unavailable, fell back to table level")
    )
    lines.append("- Metadata source: **%s**." % (state.context_source or "unknown"))
    lines.append(
        "- Severity is rule-based and auditable. The LLM wrote the narrative and refined "
        "the generated code; it never walked the graph."
    )
    if ranked:
        lines.append("- Top scoring factors: %s." % "; ".join(ranked[0].reasons[:6]))
    seed_usage = stats.get("seed_usage") or {}
    for key, usage in list(seed_usage.items())[:3]:
        column = key.split("::")[-1]
        lines.append(
            "- `%s` appears in **%s queries** from **%s users** in the last %s days."
            % (
                column,
                format(usage.get("total_queries", 0), ","),
                usage.get("distinct_users", 0),
                usage.get("window_days", 30),
            )
        )
    if state.errors:
        lines.append("")
        lines.append("**Warnings**")
        for error in state.errors[:6]:
            lines.append("- %s" % error)
    lines.append("")
    lines.append("</details>")
    lines.append("")
    lines.append("---")
    lines.append(
        "<sub>Blast Radius — pre-merge Data Change Firewall • powered by DataHub context • %s</sub>"
        % now
    )
    return "\n".join(lines)
