"""blast-radius command line interface.

  blast-radius analyze --base <sha>   run the firewall on a PR (used by CI)
  blast-radius demo                   the killer demo, no Docker required
  blast-radius explain <asset.column> ad-hoc: what breaks if I change this?
  blast-radius audit                  reverse mode: risky upstreams of prod models
  blast-radius doctor                 check the whole environment
  blast-radius mcp-check              list the DataHub MCP tools we can see
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from typing import List, Optional

from .config import Settings
from .state import BlastRadiusState

log = logging.getLogger("blast_radius")

BANNER = "blast-radius — pre-merge Data Change Firewall"


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(message)s" if not verbose else "%(levelname)-7s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _write_artifacts(state: BlastRadiusState, out_dir: str) -> List[str]:
    written: List[str] = []
    for artifact in state.artifacts:
        target = os.path.join(out_dir, artifact.path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(artifact.content)
        written.append(target)
    return written


def _emit_outputs(state: BlastRadiusState, settings: Settings, out_dir: str) -> None:
    """Persist everything a human or a later CI step might want."""
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "comment.md"), "w", encoding="utf-8") as handle:
        handle.write(state.comment_markdown or "")
    with open(os.path.join(out_dir, "result.json"), "w", encoding="utf-8") as handle:
        json.dump(state.to_dict(), handle, indent=2, default=str)

    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        try:
            with open(step_summary, "a", encoding="utf-8") as handle:
                handle.write(state.comment_markdown or "")
                handle.write("\n")
        except Exception as exc:  # noqa: BLE001
            log.debug("could not write step summary: %s", exc)

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        try:
            with open(github_output, "a", encoding="utf-8") as handle:
                handle.write("severity=%s\n" % state.severity)
                handle.write("score=%.2f\n" % state.score)
                handle.write("impacted=%d\n" % len(state.impacted))
                handle.write("ml_at_risk=%d\n" % len(state.ml_assets))
        except Exception as exc:  # noqa: BLE001
            log.debug("could not write job outputs: %s", exc)


def _publish(state: BlastRadiusState, settings: Settings, deps) -> int:
    """Post the comment, set the status check, open the companion PR.

    Returns the process exit code: non-zero blocks the merge.
    """
    from .github_api import GitHubClient, load_event_payload
    from .render.comment import STICKY_MARKER
    from .severity import severity_at_least

    blocked = severity_at_least(state.severity, settings.fail_on)
    client = GitHubClient(
        settings.github_token, settings.github_repository, settings.github_api_url, settings.github_server_url
    )

    if not client.enabled:
        log.info("GITHUB_TOKEN not set - skipping PR comment and status check")
        return 1 if blocked else 0

    payload = load_event_payload(os.environ.get("GITHUB_EVENT_PATH"))
    pr = payload.get("pull_request") or {}
    pr_number = settings.pr_number or pr.get("number")
    head_sha = settings.head_sha or (pr.get("head") or {}).get("sha")
    base_branch = (pr.get("base") or {}).get("ref") or "main"
    head_branch = (pr.get("head") or {}).get("ref")

    # Human override: a labelled PR reports but does not block.
    if pr_number and blocked:
        labels = client.get_labels(int(pr_number))
        if "blast-radius:override" in labels:
            log.warning("blast-radius:override label present - reporting without blocking")
            blocked = False
            state.errors.append("Merge block overridden by the blast-radius:override label.")
            from .render.comment import render_comment

            state.comment_markdown = render_comment(state, settings)

    if pr_number:
        try:
            client.upsert_sticky_comment(int(pr_number), STICKY_MARKER, state.comment_markdown or "")
            log.info("posted the sticky comment on PR #%s", pr_number)
        except Exception as exc:  # noqa: BLE001
            log.error("could not post the PR comment: %s", exc)

    if head_sha:
        description = "%s - %d downstream assets, %d ML entities at risk" % (
            state.severity,
            len(state.impacted),
            len(state.ml_assets),
        )
        try:
            client.set_commit_status(
                head_sha,
                "failure" if blocked else "success",
                description,
                context="blast-radius",
                target_url=state.document_url or settings.pr_url(),
            )
            client.create_check_run(
                head_sha,
                "Blast Radius",
                "failure" if blocked else "success",
                "%s - %s" % (state.severity, state.headline or "analysis complete"),
                (state.narrative or "")[:60000] or description,
                state.comment_markdown,
            )
            log.info("status check set to %s", "failure" if blocked else "success")
        except Exception as exc:  # noqa: BLE001
            log.error("could not set the status check: %s", exc)

    # Companion migration PR - the "here is the fix" half of the demo.
    if (
        state.artifacts
        and settings.open_companion_pr
        and head_branch
    ):
        branch = "%s-%s" % (settings.companion_branch_prefix, str(pr_number or "local"))
        try:
            base_sha = client.get_ref_sha(head_branch)
            client.create_branch(branch, base_sha)
            for artifact in state.artifacts:
                client.put_file(
                    branch,
                    artifact.path,
                    artifact.content,
                    "blast-radius: %s" % artifact.purpose[:60],
                )
            existing = client.find_open_pr(branch)
            if existing:
                log.info("companion PR already open: %s", existing.get("html_url"))
                state.errors.append("Companion migration PR: %s" % existing.get("html_url"))
            else:
                body = "\n".join(
                    [
                        "Generated by **Blast Radius** for #%s." % pr_number,
                        "",
                        "Severity: **%s**. %s" % (state.severity, state.headline or ""),
                        "",
                        "Every file here is grounded in the live DataHub schema "
                        "(`list_schema_fields`), not guessed.",
                        "",
                    ]
                    + ["- `%s` - %s" % (a.path, a.purpose) for a in state.artifacts]
                )
                created = client.create_pull_request(
                    "Blast Radius migration for #%s" % pr_number,
                    body,
                    branch,
                    head_branch,
                )
                log.info("opened the companion migration PR: %s", created.get("html_url"))
        except Exception as exc:  # noqa: BLE001
            log.error("could not open the companion PR: %s", exc)

    return 1 if blocked else 0


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------
def cmd_analyze(args) -> int:
    from .graph import Deps, run_pipeline
    from .render.terminal import render_terminal

    settings = Settings.load(repo_root=args.repo_root)
    if args.fail_on:
        settings.fail_on = args.fail_on.upper()
    if args.no_writeback:
        settings.writeback = False
    if args.max_hops:
        settings.max_hops = args.max_hops

    deps = Deps.build(settings)
    for note in deps.notes:
        log.info("%s", note)

    state = BlastRadiusState(
        base_ref=args.base,
        head_ref=args.head,
        simulate=list(args.simulate or []),
    )
    state = run_pipeline(state, deps)

    print(render_terminal(state, settings))
    out_dir = args.out or os.path.join(settings.repo_root, ".blast-radius")
    _emit_outputs(state, settings, out_dir)
    if args.write_artifacts:
        for path in _write_artifacts(state, settings.repo_root):
            log.info("wrote %s", path)

    code = _publish(state, settings, deps)
    deps.close()
    if args.no_fail:
        return 0
    return code


def cmd_demo(args) -> int:
    """The 90 second demo. No Docker, no tokens, no network."""
    from .graph import Deps, run_pipeline
    from .render.terminal import render_terminal

    os.environ.setdefault("BLAST_RADIUS_CONTEXT_SOURCE", "fixture")
    settings = Settings.load(repo_root=args.repo_root)
    if args.context_source:
        settings.context_source = args.context_source
    settings.writeback = True

    deps = Deps.build(settings)
    for note in deps.notes:
        log.info("%s", note)

    simulate = list(args.simulate or []) or [
        "rename:stg_user_transactions.txn_amount_usd->transaction_amount_usd"
    ]
    state = BlastRadiusState(simulate=simulate)
    state = run_pipeline(state, deps)

    print(render_terminal(state, settings))
    out_dir = args.out or os.path.join(settings.repo_root, ".blast-radius")
    _emit_outputs(state, settings, out_dir)
    print("")
    print("PR comment written to %s" % os.path.join(out_dir, "comment.md"))
    if args.print_comment:
        print("")
        print(state.comment_markdown)
    deps.close()
    return 0


def cmd_explain(args) -> int:
    """Ad-hoc impact analysis without a diff: `explain users.email --kind drop`."""
    from .graph import Deps, run_pipeline
    from .render.terminal import render_terminal

    settings = Settings.load(repo_root=args.repo_root)
    settings.writeback = False
    deps = Deps.build(settings)

    target = args.target
    if "." not in target:
        print("target must look like asset.column, for example stg_user_transactions.txn_amount_usd")
        return 2
    asset, column = target.rsplit(".", 1)
    spec = "%s:%s.%s" % (args.kind, asset, column)
    if args.kind == "rename":
        spec += "->%s_v2" % column

    state = BlastRadiusState(simulate=[spec])
    state = run_pipeline(state, deps)
    print(render_terminal(state, settings))
    deps.close()
    return 0


def cmd_audit(args) -> int:
    """Reverse mode: which upstreams of our critical models are unowned,
    undocumented, or deprecated? Same engine, opposite direction."""
    from .context import build_context
    from .context.base import ML_TYPES
    from .lineage import collect_upstream_risks

    settings = Settings.load(repo_root=args.repo_root)
    ctx, notes = build_context(settings)
    for note in notes:
        log.info("%s", note)

    targets: List[str] = list(args.urn or [])
    if not targets:
        for entity_type in ("mlModel", "mlModelDeployment"):
            try:
                for hit in ctx.search("*", entity_types=[entity_type], limit=25):
                    targets.append(hit.urn)
            except Exception as exc:  # noqa: BLE001
                log.warning("search for %s failed: %s", entity_type, exc)

    if not targets:
        print("No ML models found in the catalog. Seed the ML slice first:")
        print("  python scripts/seed_datahub_ml_slice.py")
        return 1

    total = 0
    rows: List[dict] = []
    print("")
    print("UPSTREAM RISK AUDIT - assets feeding production ML with governance gaps")
    print("=" * 96)
    for urn in targets:
        try:
            risks = collect_upstream_risks(ctx, urn, max_hops=args.max_hops)
        except Exception as exc:  # noqa: BLE001
            log.warning("upstream walk failed for %s: %s", urn, exc)
            continue
        if not risks:
            continue
        model = urn.split(",")[-2] if "," in urn else urn
        print("")
        print("  %s" % model)
        print("  " + "-" * 92)
        for risk in risks:
            total += 1
            rows.append(risk)
            print(
                "    %-44s %-16s hop %-3s %s"
                % (
                    risk["name"][:44],
                    risk["type"],
                    risk["hops"],
                    ", ".join(risk["problems"]),
                )
            )
    print("")
    print("=" * 96)
    print("%d upstream asset(s) with governance gaps feed production ML." % total)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(rows, handle, indent=2, default=str)
        print("Wrote %s" % args.json_out)

    closer = getattr(ctx, "close", None)
    if callable(closer):
        closer()
    return 1 if (args.fail_on_findings and total) else 0


def cmd_mcp_check(args) -> int:
    from .config import Settings as _Settings
    from .mcp_client import McpStdioClient

    settings = _Settings.load(repo_root=args.repo_root)
    command = settings.mcp_command
    print("Launching the DataHub MCP server: %s" % command)
    env = dict(os.environ)
    env["DATAHUB_GMS_URL"] = settings.datahub_gms_url
    if settings.datahub_gms_token:
        env["DATAHUB_GMS_TOKEN"] = settings.datahub_gms_token
    env["TOOLS_IS_MUTATION_ENABLED"] = "true" if settings.mutations_enabled else "false"

    client = McpStdioClient(command, env=env)
    try:
        client.start()
        tools = client.list_tools()
    except Exception as exc:  # noqa: BLE001
        print("MCP server unavailable: %s" % exc)
        print("That is fine - the SDK and fixture contexts still work.")
        return 1
    finally:
        try:
            client.close()
        except Exception:  # noqa: BLE001
            pass

    print("")
    print("%d tool(s) exposed:" % len(tools))
    for tool in tools:
        name = tool.get("name", "?")
        description = (tool.get("description") or "").split("\n")[0][:88]
        print("  %-38s %s" % (name, description))
    mutations = [t.get("name") for t in tools if any(
        key in (t.get("name") or "") for key in ("add_", "update_", "save_", "propose_")
    )]
    print("")
    if mutations:
        print("Mutation tools visible: %s" % ", ".join(mutations))
    else:
        print("No mutation tools visible. Set TOOLS_IS_MUTATION_ENABLED=true to enable writeback.")
    return 0


def cmd_doctor(args) -> int:
    from .context import build_context
    from .llm import LlmClient

    settings = Settings.load(repo_root=args.repo_root)
    ok = True

    print("")
    print(BANNER)
    print("=" * 72)
    print("")
    print("Python           %s" % sys.version.split()[0])
    print("Repo root        %s" % settings.repo_root)
    cfg_file = os.path.join(str(settings.repo_root), "blast-radius.yml")
    print("Config           %s" % (cfg_file if os.path.exists(cfg_file) else "defaults (no blast-radius.yml)"))
    print("")

    for module in ("sqlglot", "yaml", "langgraph", "datahub", "datahub_agent_context"):
        try:
            __import__(module)
            print("  [ok]      %s" % module)
        except Exception:  # noqa: BLE001
            required = module in ("sqlglot", "yaml")
            print("  [%s]  %s%s" % (
                "MISSING" if required else "absent ",
                module,
                "" if required else "  (optional - graceful fallback in place)",
            ))
            if required:
                ok = False

    print("")
    llm = LlmClient(settings)
    print("  LLM           %s" % llm.describe())
    print("  DataHub GMS   %s" % settings.datahub_gms_url)
    print("  GMS token     %s" % ("set" if settings.datahub_gms_token else "not set"))
    print("  Writeback     %s" % ("enabled" if settings.writeback else "disabled"))
    print("  Mutations     %s" % ("enabled" if settings.mutations_enabled else "disabled"))
    print("  GitHub        %s" % (settings.github_repository or "not configured"))
    print("  Fail on       %s" % settings.fail_on)

    print("")
    ctx, notes = build_context(settings)
    for note in notes:
        print("  %s" % note)
    try:
        health = ctx.health()
        print("  Context       %s" % health)
    except Exception as exc:  # noqa: BLE001
        print("  Context       degraded: %s" % exc)

    closer = getattr(ctx, "close", None)
    if callable(closer):
        closer()

    print("")
    print("Ready." if ok else "Missing required dependencies - run: pip install -e .")
    print("")
    return 0 if ok else 1


# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="blast-radius", description=BANNER)
    parser.add_argument("--verbose", "-v", action="store_true", help="debug logging")
    parser.add_argument("--repo-root", default=".", help="repository root (default: .)")
    parser.add_argument("--config", default=None, help="path to blast-radius.yml")
    sub = parser.add_subparsers(dest="command", required=True)

    analyze = sub.add_parser("analyze", help="run the firewall on a pull request")
    analyze.add_argument("--base", default=None, help="base ref or SHA to diff against")
    analyze.add_argument("--head", default=None, help="head ref or SHA (default: working tree)")
    analyze.add_argument(
        "--simulate",
        action="append",
        help="simulate a change, e.g. rename:stg_user_transactions.txn_amount_usd->new_name",
    )
    analyze.add_argument("--fail-on", default=None, help="severity that blocks the merge")
    analyze.add_argument("--no-fail", action="store_true", help="always exit 0 (report only)")
    analyze.add_argument("--no-writeback", action="store_true", help="skip DataHub mutations")
    analyze.add_argument("--max-hops", type=int, default=None, help="lineage hop budget")
    analyze.add_argument("--out", default=None, help="output directory")
    analyze.add_argument(
        "--write-artifacts", action="store_true", help="write generated code into the repo"
    )
    analyze.set_defaults(func=cmd_analyze)

    demo = sub.add_parser("demo", help="the 90 second demo (no Docker required)")
    demo.add_argument("--simulate", action="append", help="override the simulated change")
    demo.add_argument("--context-source", default=None, choices=["auto", "sdk", "mcp", "fixture"])
    demo.add_argument("--print-comment", action="store_true", help="print the PR comment markdown")
    demo.add_argument("--out", default=None)
    demo.set_defaults(func=cmd_demo)

    explain = sub.add_parser("explain", help="what breaks if I change this column?")
    explain.add_argument("target", help="asset.column, e.g. stg_user_transactions.txn_amount_usd")
    explain.add_argument(
        "--kind",
        default="drop",
        choices=["drop", "rename", "type_change", "nullability"],
    )
    explain.set_defaults(func=cmd_explain)

    audit = sub.add_parser("audit", help="reverse mode: risky upstreams of production models")
    audit.add_argument("--urn", action="append", help="restrict to specific model URNs")
    audit.add_argument("--max-hops", type=int, default=4)
    audit.add_argument("--json-out", default=None)
    audit.add_argument("--fail-on-findings", action="store_true")
    audit.set_defaults(func=cmd_audit)

    mcp = sub.add_parser("mcp-check", help="list the DataHub MCP tools we can see")
    mcp.set_defaults(func=cmd_mcp_check)

    doctor = sub.add_parser("doctor", help="check the environment end to end")
    doctor.set_defaults(func=cmd_doctor)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    _setup_logging(args.verbose or os.environ.get("BLAST_RADIUS_VERBOSE") == "1")
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        return 130
    except Exception as exc:  # noqa: BLE001
        log.exception("blast-radius failed: %s", exc)
        return 2


if __name__ == "__main__":
    sys.exit(main())
