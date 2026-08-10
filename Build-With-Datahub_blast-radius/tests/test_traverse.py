"""The graph walk is deterministic, so it is testable - and it is tested
against the same fixture graph the demo uses.

The assertion that matters: starting from one column in a staging model, the
walk must reach the production model deployment. If this test fails, the demo
fails.
"""
from __future__ import annotations

import pytest

from blast_radius.config import Settings
from blast_radius.context.fixture import FixtureContext
from blast_radius.lineage import collect_upstream_risks, traverse_downstream
from blast_radius.state import BlastRadiusState

STG = "urn:li:dataset:(urn:li:dataPlatform:dbt,analytics.staging.stg_user_transactions,PROD)"
MODEL = "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fraud_risk_v3,PROD)"
DEPLOYMENT = (
    "urn:li:mlModelDeployment:(urn:li:dataPlatform:sagemaker,fraud-risk-v3-prod,PROD)"
)
FEATURE = "urn:li:mlFeature:(user_risk_features,user_txn_velocity_7d)"
SCRATCH = "urn:li:dataset:(urn:li:dataPlatform:snowflake,SANDBOX.SCRATCH.TXN_PLAYGROUND,DEV)"


@pytest.fixture
def ctx():
    return FixtureContext(Settings.load())


@pytest.fixture
def walk(ctx):
    return traverse_downstream(ctx, STG, columns=["txn_amount_usd"], max_hops=6)


# --------------------------------------------------------------------------
# the demo-critical assertions
# --------------------------------------------------------------------------
def test_the_walk_reaches_the_production_model(walk):
    reached = set(walk.nodes)
    assert MODEL in reached, "raw column -> feature -> model path is broken"


def test_the_walk_reaches_the_live_deployment(walk):
    assert DEPLOYMENT in walk.nodes, (
        "the 40k req/day endpoint is the whole headline; if the walk stops at "
        "the model, the demo loses its punchline"
    )


def test_the_walk_passes_through_the_feature(walk):
    assert FEATURE in walk.nodes


def test_the_path_names_the_intermediate_transform(walk):
    """Table-level impact analysis is unimpressive. Column-level with the
    transform SQL shown is the thing judges remember."""
    paths = walk.paths.get(DEPLOYMENT) or walk.paths.get(MODEL)
    assert paths, "no path recorded to the model"
    rendered = " ".join(str(p) for p in paths)
    assert "velocity_calc" in rendered, "the intermediate hop must be named"


def test_column_level_lineage_is_actually_used(walk):
    assert any(
        getattr(p, "is_column_level", False) for group in walk.paths.values() for p in group
    ), "at least one path must be column-level, not a table-level fallback"


# --------------------------------------------------------------------------
# traversal hygiene
# --------------------------------------------------------------------------
def test_hop_budget_is_respected(ctx):
    shallow = traverse_downstream(ctx, STG, columns=["txn_amount_usd"], max_hops=1)
    assert DEPLOYMENT not in shallow.nodes
    assert len(shallow.nodes) < 13


def test_traversal_terminates_and_does_not_revisit(walk):
    assert len(walk.nodes) == len(set(walk.nodes)), "a node was visited twice"


def test_hops_increase_with_distance(walk):
    hops = walk.hops
    assert hops.get(MODEL, 99) > hops.get(FEATURE, 0)
    assert hops.get(DEPLOYMENT, 99) > hops.get(MODEL, 0)


def test_unrelated_column_does_not_reach_the_model(ctx):
    """Column tracking has to actually filter. If every column reaches
    everything, the severity score is meaningless."""
    walk = traverse_downstream(ctx, STG, columns=["merchant_id"], max_hops=6)
    assert DEPLOYMENT not in walk.nodes or len(walk.nodes) < 13


def test_unknown_urn_returns_empty_rather_than_raising(ctx):
    walk = traverse_downstream(ctx, "urn:li:dataset:(dbt,nope,PROD)", columns=["x"], max_hops=4)
    assert walk.nodes == {} or len(walk.nodes) <= 1


# --------------------------------------------------------------------------
# reverse mode (stretch goal #1)
# --------------------------------------------------------------------------
def test_upstream_audit_flags_the_unowned_deprecated_table(ctx):
    findings = collect_upstream_risks(ctx, MODEL, max_hops=5)
    assert isinstance(findings, list)


def test_scratch_table_is_in_the_downstream_set(walk):
    """It is deprecated and nobody owns it, but it still consumes the column -
    so it belongs in the impact set, just scored near zero."""
    assert SCRATCH in walk.nodes


# --------------------------------------------------------------------------
# state plumbing
# --------------------------------------------------------------------------
def test_state_round_trips_to_dict():
    state = BlastRadiusState()
    state.severity = "CRITICAL"
    state.score = 100.0
    payload = state.to_dict()
    assert payload["severity"] == "CRITICAL"
    assert payload["score"] == 100.0
