"""Severity is the firewall's verdict, so the rules are pinned in tests.

The important property is not the exact number - it is the ordering and the
hard escalations. A production model must always outrank a certified
dashboard, which must always outrank a dev scratch table.
"""
from __future__ import annotations

from blast_radius.context.base import Entity
from blast_radius.severity import (
    SEVERITY_ORDER,
    badge_markdown,
    max_severity,
    roll_up,
    score_asset,
    severity_at_least,
)
from blast_radius.state import ColumnChange


def _entity(urn, etype, **kw):
    return Entity(
        urn=urn,
        entity_type=etype,
        name=kw.pop("name", urn.split(",")[-1].strip(")")),
        **kw,
    )


def _rename():
    return ColumnChange(
        column="txn_amount_usd",
        kind="rename",
        new_column="transaction_amount_usd",
        breaking=True,
    )


def _add():
    return ColumnChange(column="new_col", kind="add", breaking=False)


# --------------------------------------------------------------------------
# ordering helpers
# --------------------------------------------------------------------------
def test_severity_order_is_ascending():
    assert SEVERITY_ORDER == ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


def test_severity_at_least():
    assert severity_at_least("CRITICAL", "HIGH")
    assert severity_at_least("HIGH", "HIGH")
    assert not severity_at_least("MEDIUM", "HIGH")


def test_max_severity():
    assert max_severity("LOW", "HIGH") == "HIGH"
    assert max_severity("CRITICAL", "MEDIUM") == "CRITICAL"
    assert max_severity("NONE", "NONE") == "NONE"


# --------------------------------------------------------------------------
# the ordering that matters
# --------------------------------------------------------------------------
def test_production_model_outranks_certified_dashboard_outranks_dev_table():
    deployment = score_asset(
        _entity("urn:li:mlModelDeployment:(sagemaker,fraud-prod,PROD)", "mlModelDeployment",
                custom_properties={"requests_per_day": "40000"}),
        hops=5,
        changes=[_rename()],
    )
    dashboard = score_asset(
        _entity("urn:li:dashboard:(looker,exec)", "dashboard", tags=["certified", "Tier1"]),
        hops=2,
        changes=[_rename()],
    )
    scratch = score_asset(
        _entity("urn:li:dataset:(snowflake,SCRATCH.T,DEV)", "dataset", deprecated=True),
        hops=1,
        changes=[_rename()],
    )

    assert deployment[0] > dashboard[0] > scratch[0], (
        "a live model endpoint must outrank a dashboard, which must outrank "
        "a deprecated dev table - even though the endpoint is 4 hops further away"
    )


def test_hop_distance_decays_but_never_flips_the_ranking():
    near = score_asset(_entity("urn:li:dataset:(dbt,a,PROD)", "dataset"), hops=1, changes=[_rename()])
    far = score_asset(_entity("urn:li:dataset:(dbt,b,PROD)", "dataset"), hops=5, changes=[_rename()])
    assert near[0] > far[0]


def test_tier1_and_certification_raise_the_score():
    plain = score_asset(_entity("urn:li:dataset:(dbt,a,PROD)", "dataset"), hops=1, changes=[_rename()])
    tiered = score_asset(
        _entity("urn:li:dataset:(dbt,b,PROD)", "dataset", tags=["Tier1", "certified"]),
        hops=1,
        changes=[_rename()],
    )
    assert tiered[0] > plain[0]


def test_deprecation_discounts_the_score():
    live = score_asset(_entity("urn:li:dataset:(dbt,a,PROD)", "dataset"), hops=1, changes=[_rename()])
    dead = score_asset(
        _entity("urn:li:dataset:(dbt,b,PROD)", "dataset", deprecated=True), hops=1, changes=[_rename()]
    )
    assert dead[0] < live[0]


def test_real_query_usage_raises_the_score():
    quiet = score_asset(
        _entity("urn:li:dataset:(dbt,a,PROD)", "dataset"), hops=1, changes=[_rename()], query_count=0
    )
    busy = score_asset(
        _entity("urn:li:dataset:(dbt,b,PROD)", "dataset"), hops=1, changes=[_rename()], query_count=847
    )
    assert busy[0] > quiet[0], "847 queries in 30 days is the most credible severity signal we have"


def test_additive_change_scores_far_below_a_rename():
    added = score_asset(_entity("urn:li:dataset:(dbt,a,PROD)", "dataset"), hops=1, changes=[_add()])
    renamed = score_asset(_entity("urn:li:dataset:(dbt,a,PROD)", "dataset"), hops=1, changes=[_rename()])
    assert added[0] < renamed[0]


# --------------------------------------------------------------------------
# roll-up and escalation
# --------------------------------------------------------------------------
def test_a_breaking_change_reaching_a_prod_model_is_always_critical():
    entities = [
        _entity("urn:li:mlModel:(mlflow,fraud_risk_v3,PROD)", "mlModel"),
        _entity("urn:li:mlModelDeployment:(sagemaker,fraud-prod,PROD)", "mlModelDeployment",
                custom_properties={"requests_per_day": "40000"}),
    ]
    scored = [score_asset(e, hops=4, changes=[_rename()])[0] for e in entities]
    severity, _score = roll_up(scored, entities, [_rename()])
    assert severity == "CRITICAL", "a live model in the blast radius is not a judgement call"


def test_empty_impact_is_not_critical():
    severity, score = roll_up([], [], [_rename()])
    assert severity in ("NONE", "LOW")
    assert score < 20


def test_roll_up_lets_one_catastrophic_hit_dominate_a_long_tail():
    one_bad = roll_up([80.0], [_entity("urn:li:dataset:(dbt,a,PROD)", "dataset")], [_rename()])
    many_small = roll_up(
        [6.0] * 10,
        [_entity("urn:li:dataset:(dbt,%d,PROD)" % i, "dataset") for i in range(10)],
        [_rename()],
    )
    assert one_bad[1] > many_small[1]


# --------------------------------------------------------------------------
# the badge has to be a valid URL - it renders on every PR
# --------------------------------------------------------------------------
def test_badge_markdown_is_a_well_formed_shields_url():
    md = badge_markdown("CRITICAL", 100.0)
    assert md.startswith("![")
    assert "https://img.shields.io/badge/" in md
    assert "{" not in md and "}" not in md, "unrendered format braces leaked into the badge URL"
    assert md.endswith(")")


def test_badge_markdown_covers_every_severity():
    for level in SEVERITY_ORDER:
        md = badge_markdown(level, 42.0)
        assert "img.shields.io" in md and "{" not in md
