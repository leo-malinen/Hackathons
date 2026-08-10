# Setup

End to end, from an empty machine to a blocked pull request. Roughly 45
minutes if Docker cooperates, 3 minutes if you only want the demo.

---

## Level 0 — the demo, with nothing installed

```bash
cd blast-radius
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
blast-radius demo
```

You get the full five-agent run against the bundled fixture graph: the
CRITICAL verdict, the column-level path into `fraud_risk_v3`, five generated
artifacts, and the writeback log. No DataHub, no API key, no network.

This is the fallback you want ready on demo day. Infrastructure fails at the
worst possible moment; this path cannot.

---

## Level 1 — add the LLM (OpenRouter, gpt-4o-mini)

The deterministic core needs no model. The LLM sharpens the severity narrative
and rewrites the generated SQL against real schemas. It is optional by design
— a missing key must never block a merge.

1. Get a key at <https://openrouter.ai/keys>. `openai/gpt-4o-mini` costs
   roughly $0.15 per million input tokens; a full analysis is a few thousand
   tokens, so a whole hackathon runs for cents.

2. Put it in `.env`:

   ```bash
   cp .env.example .env
   ```

   ```bash
   OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   BLAST_RADIUS_MODEL=openai/gpt-4o-mini
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   ```

3. Confirm:

   ```bash
   blast-radius doctor
   #   LLM           openai/gpt-4o-mini via openrouter.ai
   ```

**Swapping models** is one line — `BLAST_RADIUS_MODEL=anthropic/claude-3.5-sonnet`
or `google/gemini-flash-1.5`. Anything OpenRouter serves works, because the
client speaks the OpenAI chat-completions shape.

**Using OpenAI directly** instead: set `OPENAI_API_KEY` and
`OPENAI_BASE_URL=https://api.openai.com/v1`, with `BLAST_RADIUS_MODEL=gpt-4o-mini`.
Both variable names are read, OpenRouter first.

---

## Level 2 — stand up DataHub

```bash
python3 -m pip install --upgrade acryl-datahub
datahub docker quickstart
```

Give it 5–10 minutes on first run. The UI lands on <http://localhost:9002>
(default login `datahub` / `datahub`); GMS is on <http://localhost:8080>.

Optional sample metadata:

```bash
git clone https://github.com/datahub-project/static-assets
datahub ingest -c <recipe>.yml
```

**Timebox this hard.** If ingestion fights you, skip it. The next step
hand-writes everything the demo needs, and judges score the agent, not your
Docker skills.

Then point Blast Radius at it:

```bash
DATAHUB_GMS_URL=http://localhost:8080
DATAHUB_GMS_TOKEN=          # blank is fine for local quickstart
TOOLS_IS_MUTATION_ENABLED=true
```

For DataHub Cloud, generate a personal access token in Settings → Access
Tokens and set both variables accordingly.

---

## Level 3 — seed the ML slice

This is the half-day that decides whether you have a generic impact tool or a
Production ML Agents submission. Sample data has warehouse tables. It does not
have features, models, or deployments.

```bash
python scripts/bootstrap_structured_properties.py   # register blast_radius_score etc.
python scripts/seed_datahub_ml_slice.py             # emit the ML slice
python scripts/seed_datahub_ml_slice.py --dry-run   # inspect first, if you like
```

That emits 18 entities and the column-level edges wiring:

```
user_transactions.amount_usd  (postgres, raw)
  → stg_user_transactions.txn_amount_usd        CAST(amount_usd AS NUMERIC(18,2))
  → int_user_txns.velocity_calc                 SUM(...) OVER (PARTITION BY user_id ... 7 days)
  → fct_user_txn_features.user_txn_velocity_7d  CAST(velocity_calc AS DOUBLE)
  → mlFeature  user_txn_velocity_7d
  → mlModel    fraud_risk_v3                    (auc 0.947)
  → mlModelDeployment fraud-risk-v3-prod        (40,000 req/day, IN_SERVICE)
```

Plus three dashboards, a chart, an Airflow DAG and job, a revenue mart, and one
deprecated unowned scratch table for reverse mode to catch.

Verify the path is live:

```bash
blast-radius explain stg_user_transactions.txn_amount_usd --kind rename
```

If that names `fraud_risk_v3`, everything downstream works.

---

## Level 4 — the MCP server

The SDK path is what CI uses. The MCP path proves the integration and drives
the interactive loop.

```bash
npx -y @acryldata/mcp-server-datahub init
# DataHub Cloud:
claude mcp add --transport http datahub https://mcp.datahub.com/mcp
```

Check the tools are actually exposed, including the mutating ones:

```bash
TOOLS_IS_MUTATION_ENABLED=true blast-radius mcp-check
```

Force the pipeline through MCP instead of the SDK:

```bash
BLAST_RADIUS_CONTEXT_SOURCE=mcp blast-radius demo
```

Add the skills:

```bash
npx skills add datahub-project/datahub-skills
```

The custom skill lives at `skills/blast-radius/SKILL.md` and ships in this
repo.

---

## Level 5 — wire it into GitHub

1. Push this repo.

2. Add repository secrets under **Settings → Secrets and variables → Actions**:

   | Secret | Value |
   |---|---|
   | `DATAHUB_GMS_URL` | Your reachable GMS URL. `localhost` will not work from a hosted runner — use DataHub Cloud, a tunnel, or a self-hosted runner. |
   | `DATAHUB_GMS_TOKEN` | Personal access token. |
   | `DATAHUB_FRONTEND_URL` | Optional; makes catalog links clickable in the comment. |
   | `OPENROUTER_API_KEY` | Your OpenRouter key. |

   `GITHUB_TOKEN` is injected automatically.

3. Confirm **Settings → Actions → General → Workflow permissions** is set to
   read *and write*, and that Actions may create pull requests. The workflow
   already requests `contents: write`, `pull-requests: write`,
   `statuses: write`, `checks: write`.

4. To make the check genuinely blocking, add a branch protection rule on `main`
   requiring the **Data Change Firewall** status check.

5. Open the dangerous PR:

   ```bash
   ./scripts/demo_pr.sh
   ```

If GMS is unreachable from the runner, the job still completes against the
fixture graph and says so in the comment. The demo never dies on
infrastructure.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `context source: fixture` when you expected live | GMS unreachable or the SDK is missing. `blast-radius doctor` prints the reason. |
| `unresolved` URNs in the output | The file path did not map to a catalog entity. Add an explicit mapping under `overrides.urns` in `blast-radius.yml`. |
| Impact set is empty on a real change | Column-level lineage was never ingested. Table-level still works; enable column-level lineage in your dbt/warehouse recipe. |
| Writeback rows all say `skipped` | `TOOLS_IS_MUTATION_ENABLED` is not `true`, or the token lacks write scope. |
| `add_structured_properties` rejected | Run `scripts/bootstrap_structured_properties.py` first; the property must exist before it can be set. |
| LLM shows `disabled (deterministic mode)` | No key found. Everything still runs; artifacts come from templates. |
| No PR comment | Missing `GITHUB_TOKEN`, or workflow permissions are read-only. |
| Companion PR not created | Actions is not allowed to create pull requests, or the branch already exists. |
| `langgraph unavailable` | Expected without the extra. `pip install "blast-radius[ci]"` for the real state machine; the sequential runner is otherwise identical. |

---

## Verifying the whole thing

```bash
pytest -q                 # the deterministic core
blast-radius doctor       # config + connectivity
blast-radius demo         # the full pipeline, offline
blast-radius audit        # reverse mode
```

The demo must print `CRITICAL`, name three dashboards, one Airflow job, and
`fraud_risk_v3` at 40,000 req/day via `user_txn_velocity_7d`. If it does, you
are ready to record.
