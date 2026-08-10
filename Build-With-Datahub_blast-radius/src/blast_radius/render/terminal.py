"""Terminal rendering for local runs and the demo.

No dependencies, ANSI only, degrades to plain text when not a TTY.
"""

from __future__ import annotations

import os
import sys
from typing import List

from ..context.base import BI_TYPES, ML_TYPES, PIPELINE_TYPES
from ..lineage import describe_path
from ..state import BlastRadiusState

_COLORS = {
    "CRITICAL": "\033[97;41m",
    "HIGH": "\033[30;43m",
    "MEDIUM": "\033[30;46m",
    "LOW": "\033[30;47m",
    "NONE": "\033[30;42m",
}
_RESET = "\033[0m"
_DIM = "\033[2m"
_BOLD = "\033[1m"


def _use_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("GITHUB_ACTIONS") == "true":
        return True
    return sys.stdout.isatty()


def _c(text: str, code: str) -> str:
    return code + text + _RESET if _use_color() else text


def render_terminal(state: BlastRadiusState, settings) -> str:
    lines: List[str] = []
    width = 78
    ranked = sorted(state.impacted, key=lambda i: -i.score)
    labels = {i.entity.urn: i.entity.short_name for i in state.impacted}
    for asset in state.changed_assets:
        if asset.urn:
            labels.setdefault(asset.urn, asset.name)

    def label(urn: str) -> str:
        return labels.get(urn, urn.split(":")[-1])

    lines.append("")
    lines.append(_c(" BLAST RADIUS ", _BOLD) + _DIM + " pre-merge Data Change Firewall" + _RESET)
    lines.append("=" * width)
    lines.append(
        "  "
        + _c(" %s " % state.severity, _COLORS.get(state.severity, ""))
        + "  score %.1f   %d downstream assets   source: %s"
        % (state.score, len(state.impacted), state.context_source or "?")
    )
    lines.append("=" * width)

    if state.headline:
        lines.append("")
        for chunk in _wrap(state.headline, width - 2):
            lines.append("  " + _c(chunk, _BOLD))
    if state.narrative:
        lines.append("")
        for chunk in _wrap(state.narrative, width - 2):
            lines.append("  " + chunk)

    lines.append("")
    lines.append(_c("CHANGES", _BOLD))
    if state.changed_assets:
        for asset in state.changed_assets:
            lines.append(
                "  %s  %s  [urn: %s]" % (asset.path, _DIM + asset.asset_type + _RESET if _use_color() else asset.asset_type, asset.urn_confidence)
            )
            for change in asset.changes[:8]:
                flag = "BREAKING" if change.is_breaking else "        "
                lines.append(
                    "    %s  %s" % (flag, change.describe().replace("`", ""))
                )
    else:
        lines.append("  (none detected)")

    ml = [i for i in ranked if i.entity.entity_type in ML_TYPES]
    if ml:
        lines.append("")
        lines.append(_c("ML SURFACE", _BOLD))
        for item in ml[:6]:
            entity = item.entity
            extra = (
                "  %s req/day" % format(entity.requests_per_day, ",")
                if entity.requests_per_day
                else ""
            )
            lines.append("  %-34s %-18s%s" % (entity.short_name, entity.entity_type, extra))
            path = item.best_path()
            if path:
                for chunk in _wrap(describe_path(path, label), width - 6):
                    lines.append("      " + (_DIM + chunk + _RESET if _use_color() else chunk))

    if ranked:
        lines.append("")
        lines.append(_c("DOWNSTREAM IMPACT", _BOLD))
        lines.append(
            "  %-30s %-18s %5s %8s  %s" % ("ASSET", "TYPE", "HOPS", "SCORE", "USAGE")
        )
        lines.append("  " + "-" * (width - 4))
        for item in ranked[:14]:
            entity = item.entity
            if item.usage.total_queries:
                usage = "%s q/30d" % format(item.usage.total_queries, ",")
            elif entity.requests_per_day:
                usage = "%s req/day" % format(entity.requests_per_day, ",")
            else:
                usage = "-"
            lines.append(
                "  %-30s %-18s %5d %8.1f  %s"
                % (entity.short_name[:30], entity.entity_type, item.hops, item.score, usage)
            )

    if state.artifacts:
        lines.append("")
        lines.append(_c("GENERATED REMEDIATION", _BOLD))
        for artifact in state.artifacts:
            lines.append("  %-52s %s" % (artifact.path, artifact.generated_by))
            lines.append("      " + artifact.purpose)

    if state.writebacks:
        lines.append("")
        lines.append(_c("DATAHUB WRITEBACK", _BOLD))
        for record in state.writebacks[:12]:
            mark = "ok  " if record.ok else "FAIL"
            lines.append("  [%s] %-26s %s" % (mark, record.action, (record.detail or record.target)[:44]))
        if state.document_url:
            lines.append("  Change Impact Record: %s" % state.document_url)

    if state.errors:
        lines.append("")
        lines.append(_c("WARNINGS", _BOLD))
        for error in state.errors[:8]:
            lines.append("  - " + error)

    lines.append("")
    lines.append("=" * width)
    return "\n".join(lines)


def _wrap(text: str, width: int) -> List[str]:
    words = (text or "").split()
    out: List[str] = []
    current = ""
    for word in words:
        if len(current) + len(word) + 1 > width:
            out.append(current)
            current = word
        else:
            current = (current + " " + word).strip()
    if current:
        out.append(current)
    return out or [""]
