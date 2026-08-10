"""[5] Knowledge Writeback - close the loop.

"Strong submissions go beyond reading metadata and contribute back to the
graph." This node is that sentence, implemented:

  save_document              a Change Impact Record for every analysis
  add_structured_properties  blast_radius_score + last_impact_review on hot assets
  add_tags                   blast-radius:<severity>, ml-critical, downstream-at-risk
  update_description         on the exact affected columns
  propose_lifecycle_stage    proposals, not blind writes, for anything destructive

The catalog gets smarter with every PR, so the next person - or the next
agent - inherits the knowledge instead of rediscovering it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from ..context.base import ML_TYPES, WritebackRecord
from ..render.document import render_change_impact_record
from ..state import BlastRadiusState

log = logging.getLogger("blast_radius.writeback")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _guard(records: List[WritebackRecord], action: str, target: str, detail: str, fn) -> None:
    """Run a mutation and record the outcome. A failed writeback must never
    fail the firewall - the PR verdict is already decided."""
    try:
        result = fn()
        # Contexts return a WritebackRecord; keep theirs so the real detail
        # (document URL, property count, tag list) survives.
        if isinstance(result, WritebackRecord):
            if not result.detail:
                result.detail = detail
            records.append(result)
            return
        records.append(
            WritebackRecord(
                action=action,
                target=target,
                detail=(str(result)[:200] if result else detail),
                ok=True,
            )
        )
    except Exception as exc:
        log.warning("%s failed on %s: %s", action, target, exc)
        records.append(
            WritebackRecord(action=action, target=target, detail=detail, ok=False, error=str(exc)[:200])
        )


def writeback(state: BlastRadiusState, deps) -> Dict[str, Any]:
    settings = deps.settings
    ctx = deps.ctx
    knowledge = settings.section("knowledge")
    records: List[WritebackRecord] = list(state.writebacks)
    document_url = state.document_url

    if not settings.writeback:
        records.append(
            WritebackRecord(
                action="skipped",
                target="datahub",
                detail="writeback disabled (BLAST_RADIUS_WRITEBACK=0)",
            )
        )
        return {"writebacks": records, "document_url": document_url}

    if not getattr(ctx, "supports_mutations", False):
        records.append(
            WritebackRecord(
                action="skipped",
                target="datahub",
                detail="context %s exposes no mutation tools (set TOOLS_IS_MUTATION_ENABLED=true)"
                % getattr(ctx, "name", "?"),
                ok=False,
            )
        )
        return {"writebacks": records, "document_url": document_url}

    severity = state.severity
    today = _now()
    ranked = sorted(state.impacted, key=lambda i: -i.score)
    related = [a.urn for a in state.changed_assets if a.urn] + [i.entity.urn for i in ranked[:10]]

    # 1) The Change Impact Record --------------------------------------
    prefix = knowledge.get("document_prefix", "Change Impact Record")
    title = "%s: %s (%s)" % (
        prefix,
        ", ".join(a.name for a in state.changed_assets[:2]) or "data change",
        today,
    )
    body = render_change_impact_record(state, settings)

    def _save():
        return ctx.save_document(title, body, related)

    before = len(records)
    _guard(records, "save_document", title, "Change Impact Record written to DataHub", _save)
    if len(records) > before and records[-1].ok:
        detail = records[-1].detail
        if detail and (detail.startswith("http") or detail.startswith("file://")):
            document_url = detail

    # 2) Structured properties on the hottest assets --------------------
    namespace = knowledge.get("tag_namespace", "blast-radius")
    budget = int(knowledge.get("max_property_writes", 8) or 8)

    targets = [a.urn for a in state.changed_assets if a.urn]
    for item in ranked:
        if len(targets) >= budget:
            break
        if item.entity.urn not in targets:
            targets.append(item.entity.urn)

    score_by_urn = {i.entity.urn: i.score for i in state.impacted}
    for urn in targets[:budget]:
        score = round(score_by_urn.get(urn, state.score), 2)

        def _properties(target_urn=urn, target_score=score):
            return ctx.add_structured_properties(
                target_urn,
                {
                    "blast_radius_score": target_score,
                    "last_impact_review": today,
                },
            )

        _guard(
            records,
            "add_structured_properties",
            urn,
            "blast_radius_score=%.2f, last_impact_review=%s" % (score, today),
            _properties,
        )

    # 3) Tags ------------------------------------------------------------
    tags = [namespace + ":" + severity.lower()]
    if any(i.entity.entity_type in ML_TYPES for i in state.impacted):
        tags.append(namespace + ":ml-critical")
    if state.impacted:
        tags.append(namespace + ":downstream-at-risk")

    for asset in state.changed_assets:
        if not asset.urn:
            continue

        def _tag(target_urn=asset.urn):
            return ctx.add_tags(target_urn, tags)

        _guard(records, "add_tags", asset.urn, ", ".join(tags), _tag)

    # 4) Column descriptions on exactly the affected columns -------------
    if knowledge.get("update_column_descriptions", True):
        for asset in state.changed_assets:
            if not asset.urn:
                continue
            for change in asset.breaking_changes[:4]:
                note = (
                    "[Blast Radius %s] %s in PR %s on %s. Downstream at risk: %s. "
                    "See the Change Impact Record before changing this column again."
                ) % (
                    severity,
                    change.describe().replace("`", ""),
                    settings.pr_url() or "(local run)",
                    today,
                    ", ".join(i.entity.short_name for i in ranked[:4]) or "none catalogued",
                )

                def _describe(target_urn=asset.urn, column=change.column, text=note):
                    return ctx.update_description(target_urn, text, column=column)

                _guard(
                    records,
                    "update_description",
                    "%s#%s" % (asset.urn, change.column),
                    "annotated affected column",
                    _describe,
                )

    # 5) Governance: propose, do not blindly deprecate --------------------
    if knowledge.get("propose_deprecation", True):
        for asset in state.changed_assets:
            if not asset.urn:
                continue
            dropped = [c for c in asset.changes if c.kind in ("drop", "rename")]
            if not dropped:
                continue
            reason = (
                "Blast Radius: %s in PR %s. %d downstream assets affected, severity %s. "
                "Proposing deprecation rather than mutating directly so the owner decides."
            ) % (
                dropped[0].describe().replace("`", ""),
                settings.pr_url() or "(local run)",
                len(state.impacted),
                severity,
            )

            def _propose(target_urn=asset.urn, text=reason):
                return ctx.propose_lifecycle_stage(target_urn, "DEPRECATED", text)

            _guard(
                records,
                "propose_lifecycle_stage",
                asset.urn,
                "deprecation proposal (owner approval required)",
                _propose,
            )

    try:
        pending = ctx.list_pending_proposals()
        if pending:
            records.append(
                WritebackRecord(
                    action="list_pending_proposals",
                    target="datahub",
                    detail="%d proposal(s) awaiting owner review" % len(pending),
                )
            )
    except Exception as exc:
        log.debug("list_pending_proposals failed: %s", exc)

    ok = sum(1 for r in records if r.ok)
    log.info("writeback: %d/%d operations succeeded", ok, len(records))

    return {"writebacks": records, "document_url": document_url}
