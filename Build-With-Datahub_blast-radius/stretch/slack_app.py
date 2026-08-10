#!/usr/bin/env python3
"""Stretch goal #2: the same engine, in Slack, for people who do not read PRs.

    @blastradius what breaks if I drop users.email?
    @blastradius rename stg_user_transactions.txn_amount_usd -> amount

Same deterministic traversal, same severity rubric, same DataHub writeback -
only the renderer changes. That is the point of keeping the graph walk out of
the LLM: you get a second product surface for about eighty lines.

    pip install slack-bolt
    export SLACK_BOT_TOKEN=xoxb-...
    export SLACK_APP_TOKEN=xapp-...
    python stretch/slack_app.py
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from blast_radius.config import Settings          # noqa: E402
from blast_radius.graph import Deps, run_pipeline  # noqa: E402
from blast_radius.nodes.parse_diff import parse_simulations  # noqa: E402
from blast_radius.state import BlastRadiusState   # noqa: E402

try:
    from slack_bolt import App
    from slack_bolt.adapter.socket_mode import SocketModeHandler
except ImportError:
    sys.exit("pip install slack-bolt")


# --------------------------------------------------------------------------
# natural language -> the same --simulate syntax the CLI uses
# --------------------------------------------------------------------------
DROP = re.compile(r"drop\s+(?:column\s+)?([\w.]+)", re.I)
RENAME = re.compile(r"rename\s+([\w.]+)\s*(?:->|to)\s*(\w+)", re.I)
RETYPE = re.compile(r"(?:change|cast|retype)\s+([\w.]+)\s*(?:->|to)\s*(\w+)", re.I)


def to_simulation(text: str):
    m = RENAME.search(text)
    if m:
        return "rename:%s->%s" % (m.group(1), m.group(2))
    m = RETYPE.search(text)
    if m:
        return "type_change:%s->%s" % (m.group(1), m.group(2))
    m = DROP.search(text)
    if m:
        return "drop:%s" % m.group(1)
    return None


EMOJI = {
    "CRITICAL": ":rotating_light:",
    "HIGH": ":warning:",
    "MEDIUM": ":large_yellow_circle:",
    "LOW": ":large_green_circle:",
    "NONE": ":white_check_mark:",
}


def render_blocks(state: BlastRadiusState):
    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "%s *%s* - score %.0f/100\n%s"
                % (
                    EMOJI.get(state.severity, ""),
                    state.severity,
                    state.score,
                    state.headline or "No downstream impact found.",
                ),
            },
        }
    ]

    ml = [a for a in state.impacted if a.entity.entity_type.startswith("ml")]
    if ml:
        lines = []
        for asset in ml[:5]:
            path = asset.best_path()
            lines.append(
                "• *%s* (`%s`, %d hops)%s"
                % (
                    asset.entity.name,
                    asset.entity.entity_type,
                    asset.hops,
                    ("\n   `%s`" % str(path)[:220]) if path else "",
                )
            )
        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": "*Production ML at risk*\n" + "\n".join(lines)}}
        )

    rows = []
    for asset in state.impacted[:10]:
        usage = "%d q/30d" % asset.usage.query_count if getattr(asset, "usage", None) and asset.usage.query_count else "-"
        rows.append(
            "%-30s %-18s %5.1f  %s"
            % (asset.entity.name[:30], asset.entity.entity_type, asset.score, usage)
        )
    if rows:
        blocks.append(
            {"type": "section", "text": {"type": "mrkdwn", "text": "```\n" + "\n".join(rows) + "\n```"}}
        )

    if state.document_url:
        blocks.append(
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": "Change Impact Record written to DataHub: %s" % state.document_url}
                ],
            }
        )

    return blocks


app = App(token=os.environ.get("SLACK_BOT_TOKEN", ""))


@app.event("app_mention")
def handle_mention(event, say):
    text = event.get("text", "")
    simulation = to_simulation(text)

    if not simulation:
        say(
            thread_ts=event.get("ts"),
            text=(
                "Ask me things like:\n"
                "• `what breaks if I drop users.email?`\n"
                "• `rename stg_user_transactions.txn_amount_usd -> amount`\n"
                "• `change fct_orders.total to double`"
            ),
        )
        return

    say(thread_ts=event.get("ts"), text="Walking the lineage graph for `%s`..." % simulation)

    settings = Settings.load()
    settings.writeback = False          # Slack questions are hypothetical; do not pollute the catalog
    deps = Deps.build(settings)
    try:
        state = BlastRadiusState()
        state.simulate = [simulation]
        state.changed_assets = parse_simulations([simulation])
        state = run_pipeline(state, deps)
        say(thread_ts=event.get("ts"), blocks=render_blocks(state), text=state.headline or "Blast radius")
    finally:
        deps.close()


if __name__ == "__main__":
    handler = SocketModeHandler(app, os.environ.get("SLACK_APP_TOKEN", ""))
    print("blastradius listening on Slack socket mode")
    handler.start()
