"""The fixture context is what makes this demoable without Docker.

It has to behave like the real thing: same interface, same URNs, same
mutation semantics. These tests pin that contract so the offline demo and the
live DataHub run tell the same story.
"""
from __future__ import annotations

import pytest

from blast_radius.config import Settings
from blast_radius.context import build_context
from blast_radius.context.base import DataHubContext
from blast_radius.context.fixture import FixtureContext

STG = "urn:li:dataset:(urn:li:dataPlatform:dbt,analytics.staging.stg_user_transactions,PROD)"
MODEL = "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fraud_risk_v3,PROD)"
DEPLOYMENT = (
    "urn:li:mlModelDeployment:(urn:li:dataPlatform:sagemaker,fraud-risk-v3-prod,PROD)"
)


@pytest.fixture
def ctx():
    return FixtureContext(Settings.load())


# --------------------------------------------------------------------------
# interface conformance
# --------------------------------------------------------------------------
def test_fixture_implements_the_whole_context_interface(ctx):
    required = [
        name
        for name in dir(DataHubContext)
        if not name.startswith("_") and callable(getattr(DataHubContext, name, None))
    ]
    missing = [name for name in required if not hasattr(ctx, name)]
    assert not missing, "fixture context is missing %s" % missing


def test_fixture_supports_mutations(ctx):
    assert ctx.supports_mutations is True


def test_health_reports_cleanly(ctx):
    health = ctx.health()
    assert health["ok"] is True
    assert health["source"] == ctx.name


# --------------------------------------------------------------------------
# reads
# --------------------------------------------------------------------------
def test_search_finds_the_staging_model_by_bare_name(ctx):
    hits = ctx.search("stg_user_transactions", entity_types=["dataset"])
    assert any(h.urn == STG for h in hits)


def test_get_entity_returns_owners_and_tags(ctx):
    entity = ctx.get_entity(STG)
    assert entity is not None
    assert entity.owners, "owner metadata drives the 'who do I ping' line"
    assert any("Tier1" in t or "certified" in t for t in entity.tags)


def test_schema_fields_are_available_for_code_generation(ctx):
    fields = ctx.list_schema_fields(STG)
    names = {f.name for f in fields}
    assert "txn_amount_usd" in names
    field = next(f for f in fields if f.name == "txn_amount_usd")
    assert field.native_type, "generated migrations need the real column type"


def test_query_usage_is_the_credible_severity_signal(ctx):
    usage = ctx.get_dataset_queries(STG, column="txn_amount_usd")
    assert usage.query_count >= 500, "the 847-queries line is load-bearing in the demo"


def test_downstream_edges_exist_from_the_staging_model(ctx):
    edges = ctx.get_downstream_edges(STG)
    assert edges


def test_upstream_edges_exist_into_the_deployment(ctx):
    edges = ctx.get_upstream_edges(DEPLOYMENT)
    assert edges


def test_prod_models_are_discoverable_for_reverse_mode(ctx):
    models = ctx.list_prod_ml_models()
    assert any(m.urn == MODEL for m in models)


def test_deployment_declares_its_traffic(ctx):
    entity = ctx.get_entity(DEPLOYMENT)
    assert entity.custom_properties.get("requests_per_day") == "40000"


# --------------------------------------------------------------------------
# writes
# --------------------------------------------------------------------------
def test_every_mutation_is_recorded(ctx):
    ctx.add_tags(STG, ["blast-radius:CRITICAL"])
    ctx.update_description(STG, "warned", column="txn_amount_usd")
    ctx.add_structured_properties(STG, {"blast_radius_score": 100})
    ctx.save_document("Change Impact Record - test", "body", related_urns=[STG])
    ctx.propose_lifecycle_stage(STG, "deprecated", note="test", column="txn_amount_usd")

    actions = {r.action for r in ctx.records}
    assert actions == {
        "add_tags",
        "update_description",
        "add_structured_properties",
        "save_document",
        "propose_lifecycle_stage",
    }
    assert all(r.ok for r in ctx.records)


def test_destructive_change_goes_through_a_proposal_not_a_blind_write(ctx):
    ctx.propose_lifecycle_stage(STG, "deprecated", note="renamed")
    pending = ctx.list_pending_proposals()
    assert pending, "proposals must be queryable - that is the governance story"


def test_save_document_returns_something_linkable(ctx):
    record = ctx.save_document("Change Impact Record - link", "body", related_urns=[STG])
    assert record.ok


# --------------------------------------------------------------------------
# selection
# --------------------------------------------------------------------------
def test_build_context_falls_back_to_the_fixture_when_gms_is_unreachable():
    settings = Settings.load()
    settings.datahub_gms_url = "http://127.0.0.1:9"   # nothing listens here
    settings.context_source = "auto"
    ctx, notes = build_context(settings)
    assert ctx is not None
    assert isinstance(notes, list)


def test_explicit_fixture_source_is_honoured():
    settings = Settings.load()
    settings.context_source = "fixture"
    ctx, _notes = build_context(settings)
    assert ctx.name == "fixture"
