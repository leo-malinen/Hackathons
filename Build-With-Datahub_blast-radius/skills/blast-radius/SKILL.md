---
name: blast-radius
description: >
  Compute the true blast radius of a data change using the DataHub context
  graph, all the way down to ML features, models, and deployments. Use this
  skill whenever someone proposes changing a dbt model, an Airflow DAG, a
  feature definition, or an ingestion config, or asks "what breaks if I change
  X?". Produces a severity verdict, a migration plan, and a knowledge writeback.
license: Apache-2.0
version: 1.0.0
---

# Blast Radius

A schema change is never local. This skill encodes the four things you have to
get right: **how to classify a change**, **which hops to walk**, **how to score
severity**, and **what to write back**.

## 0. The one rule

**Never freestyle the lineage traversal.** Call the lineage tools and follow the
edges they return. A hallucinated hop is worse than no answer, because someone
will merge on the strength of it. Language models are for classification,
narrative, and code. The graph walk is deterministic.

## 1. Classify the change

Parse the diff structurally (AST, not regex). Assign every column delta one kind:

| Kind | Meaning | Breaking |
|---|---|---|
| `drop` | column removed from the output | yes |
| `rename` | same expression, new alias | yes |
| `type_change` | cast or declared type changed | yes |
| `nullability` | not-null constraint removed or added | yes |
| `expression_change` | same name, different logic | no, but silent |
| `add` | new column | no |

`expression_change` is the dangerous one: nothing fails, the numbers just quietly
become wrong. Treat it as breaking whenever the consumer is a model or a
certified dashboard.

Infer renames by matching the normalised source expression, not by string
similarity of the names. `total AS revenue` -> `total AS gross_revenue` is a
rename; `revenue` appearing with a different expression is not.

## 2. Resolve the URN before you walk

This is the number one failure mode. A file path is not a URN.

1. Check an explicit override map first (`overrides.urns` in config).
2. Check the on-disk cache.
3. Construct by convention: `models/marts/fct_orders.sql` ->
   `urn:li:dataset:(urn:li:dataPlatform:dbt,<database>.<schema>.fct_orders,PROD)`
   where `<schema>` comes from the folder.
4. Only then `search`, filtered by platform, and score candidates:
   exact name match `+60`, suffix match `+25`, platform match `+25`,
   PROD `+8`, folder/schema match `+12`, deprecated `-20`. Reject below 20.
5. Cache the result.

If you cannot resolve it, say so explicitly in the output. Do not guess a URN
and traverse from it.

## 3. Walk the graph

Breadth-first, downstream, column-level, hop budget 5-6.

- `get_lineage(direction=DOWNSTREAM, hops=N)` for the frontier.
- `get_lineage_paths_between(source, target)` for the exact path, **including
  the intermediate transform SQL**. Show the transform. "It propagates through
  `int_user_txns.velocity_calc` via a 7-day windowed SUM" is credible in a way
  that "3 downstream tables" is not.
- Track the column as you walk. When an edge is column-level, only follow it if
  the upstream column matches the one you are carrying. When a node has *no*
  column-level edges, fall back to table level for that hop and mark it.
- Always follow ML edges regardless of column: `mlFeatureSource`,
  `mlModelFeature`, `mlDeployment`. These are the edges that make the demo, and
  they are rarely annotated at column granularity.
- Enrich each reached node with `get_entities`: owners, domain, tags, tier,
  certification, deprecation.
- Rank by **real usage**, not edge count: `get_dataset_queries` tells you the
  column appears in 847 queries from 23 users in the last 30 days. That is the
  most persuasive number in the whole report.

## 4. Score severity

Weight by what the asset *is*, multiply by how the change *hurts*, then decay by
distance.

```
score = base(entity_type)
      * change_weight(kind)
      * tier_modifier          Tier1 x1.6, Tier2 x1.25, certified x1.2, deprecated x0.25
      * usage_modifier         1 + min(queries / 500, 1)
      * serving_modifier       1 + min(requests_per_day / 50000, 1)
      * hop_decay              1 / (1 + 0.15 * (hops - 1))
```

Base weights: `mlModelDeployment` 40, `mlModel` 30, `mlFeature` 18,
`mlPrimaryKey` 14, `mlFeatureTable` 12, `dashboard` 12, `dataJob` 10,
`chart` 6, `dataFlow` 6, `dataset` 4.

Roll up as `top + 0.25 * sum(rest)` so one catastrophic hit dominates but a long
tail still counts. Bands: CRITICAL >= 70, HIGH >= 45, MEDIUM >= 20.

**Hard escalations, applied after scoring:**

- breaking change reaching an `mlModel` or `mlModelDeployment` -> **CRITICAL**,
  always. A production model is not a judgement call.
- breaking change reaching a certified or Tier1 dashboard -> at least **HIGH**.
- breaking change on a column with >= 500 queries in 30 days -> at least **HIGH**.
- breaking change with an empty impact set -> **LOW**, and say plainly that the
  asset is either a leaf or its lineage is not ingested. Absence of evidence is
  not evidence of safety.

## 5. Generate the fix

Ground every generated file in `list_schema_fields`. Real column names, real
types. A migration that references a column that does not exist is worse than no
migration.

Always expand-then-contract, never rename in place:

1. `ALTER TABLE ... ADD COLUMN` the new name.
2. Backfill from the old column.
3. Verify with a query that must return zero.
4. Ship a shim view aliasing old -> new so nothing breaks today.
5. Drop the old column in a **separate, later** PR, once the consumer list is
   empty.

Also emit: a dbt contract with `enforced: true` (so the next drift fails the
build instead of silently poisoning a feature), a backfill DAG for downstream
re-materialisation, and the tests that would have caught this.

## 6. Write it back

An analysis nobody can find is an analysis that gets repeated. After every run:

- `save_document` a **Change Impact Record**: what changed, who owns what,
  which models were at risk, the decision taken, a link to the PR.
- `add_structured_properties` on the hot assets: `blast_radius_score`,
  `last_impact_review`.
- `add_tags`: `blast-radius:<severity>`, `blast-radius:ml-critical`,
  `blast-radius:downstream-at-risk`.
- `update_description` on the exact affected columns, so the next person editing
  that column sees the warning in the catalog.
- For anything destructive, `propose_lifecycle_stage` and let the owner approve.
  Check `list_pending_proposals` before proposing the same thing twice.

The catalog should be measurably smarter after the PR than it was before it.
That is the whole point: the next person, or the next agent, inherits the
knowledge instead of rediscovering it.

## 7. Report

Lead with the verdict and the single most alarming fact. Not "13 downstream
assets were identified" but:

> This breaks 3 dashboards, 1 Airflow DAG, and - critically - `fraud_risk_v3`,
> a production ML model serving 40,000 req/day, via feature
> `user_txn_velocity_7d`.

Then the path with transforms, then the table ranked by score, then the
generated migration. Always disclose how you computed it: seeds, nodes visited,
edges walked, whether column-level lineage was available, and which parts were
rule-based versus model-written.
