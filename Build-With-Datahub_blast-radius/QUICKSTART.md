# Quickstart

Three commands. No DataHub, no Docker, no API key.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
blast-radius demo
```

---

## What you just saw

```
 BLAST RADIUS  pre-merge Data Change Firewall
==============================================================================
   CRITICAL   score 100.0   13 downstream assets   source: fixture
==============================================================================

  This breaks 3 dashboards, 1 Airflow job, 4 downstream tables, and -
  critically - `fraud_risk_v3`, a production ML model serving 40,000 req/day
  via feature `user_txn_velocity_7d`.
```

One renamed column in a staging model. The pipeline walked the graph, found a
live model endpoint five hops away, scored it CRITICAL, generated five
remediation artifacts, and recorded twelve writebacks to the catalog.

The full PR comment is written to `.blast-radius/comment.md`, and the generated
migration SQL, shim view, dbt contract, backfill DAG, and tests are in
`.blast-radius/artifacts/`.

---

## The five things worth trying next

**Ask a what-if question.**

```bash
blast-radius explain stg_user_transactions.txn_amount_usd --kind drop
blast-radius explain fct_revenue_daily.gross_revenue_usd --kind type_change
```

**Simulate a change without git.**

```bash
blast-radius analyze --simulate 'rename:stg_user_transactions.txn_amount_usd->amount'
blast-radius analyze --simulate 'drop:int_user_txns.velocity_calc'
```

**See the PR comment exactly as GitHub renders it.**

```bash
blast-radius demo --print-comment
```

Badge, ML-at-risk section, ranked impact table, mermaid diagram, generated
code, writeback log.

**Run reverse mode.**

```bash
blast-radius audit
```

Walks *upstream* from every production model and flags dependencies with no
owner, no tests, no docs, or a deprecated status. Same engine, opposite
direction.

**Check what is wired up.**

```bash
blast-radius doctor
```

---

## Turning on the real thing

| Want | Do |
|---|---|
| Live catalog instead of fixtures | `datahub docker quickstart`, then `python scripts/seed_datahub_ml_slice.py` |
| MCP instead of the SDK | `BLAST_RADIUS_CONTEXT_SOURCE=mcp blast-radius demo` |
| Block real merges | Add the repo secrets and require the check on `main` |

Full instructions in `SETUP.md`. Demo-day runbook in `DEMO_SCRIPT.md`.

---

## The one-line mental model

> Deterministic graph traversal decides *what breaks*. The LLM only explains it
> and writes the fix. That is why it works live.