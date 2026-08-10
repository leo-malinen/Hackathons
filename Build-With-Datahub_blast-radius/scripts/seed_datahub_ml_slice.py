#!/usr/bin/env python3
"""Hand-author the ML slice that makes the demo.

Sample ingestion gives you warehouse tables. It does *not* give you the
raw column -> feature -> model -> deployment path, and that path is the
entire Production ML Agents story. This script emits it with the DataHub
Python SDK.

It emits exactly the URNs in src/blast_radius/fixtures/demo_graph.json, so
the live run and the offline fixture run tell the same story.

    pip install --upgrade acryl-datahub
    datahub docker quickstart
    python scripts/seed_datahub_ml_slice.py

Environment:
    DATAHUB_GMS_URL     default http://localhost:8080
    DATAHUB_GMS_TOKEN   optional for local quickstart
"""
from __future__ import annotations

import argparse
import os
import sys
import time

try:
    import datahub.emitter.mce_builder as builder
    from datahub.emitter.mcp import MetadataChangeProposalWrapper
    from datahub.emitter.rest_emitter import DatahubRestEmitter
    from datahub.metadata.schema_classes import (
        AuditStampClass,
        BrowsePathsClass,
        DataPlatformInstanceClass,
        DatasetLineageTypeClass,
        DatasetPropertiesClass,
        DeprecationClass,
        FineGrainedLineageClass,
        FineGrainedLineageDownstreamTypeClass,
        FineGrainedLineageUpstreamTypeClass,
        GlobalTagsClass,
        MLFeaturePropertiesClass,
        MLFeatureTablePropertiesClass,
        MLModelDeploymentPropertiesClass,
        MLModelPropertiesClass,
        MLPrimaryKeyPropertiesClass,
        NumberTypeClass,
        OwnerClass,
        OwnershipClass,
        OwnershipTypeClass,
        SchemaFieldClass,
        SchemaFieldDataTypeClass,
        SchemaMetadataClass,
        StringTypeClass,
        TagAssociationClass,
        TimeTypeClass,
        UpstreamClass,
        UpstreamLineageClass,
    )
except ImportError:  # pragma: no cover - guidance path
    sys.exit(
        "acryl-datahub is not installed.\n"
        "    python3 -m pip install --upgrade acryl-datahub\n"
    )


# --------------------------------------------------------------------------
# URNs - these must match fixtures/demo_graph.json exactly
# --------------------------------------------------------------------------
ENV = "PROD"

D_RAW = builder.make_dataset_urn("postgres", "billing.public.user_transactions", ENV)
D_STG = builder.make_dataset_urn("dbt", "analytics.staging.stg_user_transactions", ENV)
D_INT = builder.make_dataset_urn("dbt", "analytics.intermediate.int_user_txns", ENV)
D_FCT = builder.make_dataset_urn("dbt", "analytics.marts.fct_user_txn_features", ENV)
D_REV = builder.make_dataset_urn("dbt", "analytics.marts.fct_revenue_daily", ENV)
D_SCRATCH = builder.make_dataset_urn("snowflake", "SANDBOX.SCRATCH.TXN_PLAYGROUND", "DEV")

FEATURE_TABLE = "urn:li:mlFeatureTable:(urn:li:dataPlatform:feast,user_risk_features)"
F_VELOCITY = "urn:li:mlFeature:(user_risk_features,user_txn_velocity_7d)"
F_AVG30 = "urn:li:mlFeature:(user_risk_features,user_txn_amount_avg_30d)"
PK_USER = "urn:li:mlPrimaryKey:(user_risk_features,user_id)"
MODEL = "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fraud_risk_v3,PROD)"
DEPLOYMENT = "urn:li:mlModelDeployment:(urn:li:dataPlatform:sagemaker,fraud-risk-v3-prod,PROD)"

NOW = int(time.time() * 1000)
STAMP = AuditStampClass(time=NOW, actor="urn:li:corpuser:blast-radius")


def _field(name: str, native: str, kind, description: str = "") -> SchemaFieldClass:
    return SchemaFieldClass(
        fieldPath=name,
        type=SchemaFieldDataTypeClass(type=kind()),
        nativeDataType=native,
        description=description,
        nullable=True,
    )


def _schema(urn: str, platform: str, fields) -> MetadataChangeProposalWrapper:
    return MetadataChangeProposalWrapper(
        entityUrn=urn,
        aspect=SchemaMetadataClass(
            schemaName=urn.split(",")[1] if "," in urn else urn,
            platform=builder.make_data_platform_urn(platform),
            version=0,
            hash="",
            platformSchema=builder.OtherSchemaClass(rawSchema="")
            if hasattr(builder, "OtherSchemaClass")
            else None,
            fields=list(fields),
        ),
    )


def _owner(urn: str, group: str) -> MetadataChangeProposalWrapper:
    return MetadataChangeProposalWrapper(
        entityUrn=urn,
        aspect=OwnershipClass(
            owners=[
                OwnerClass(
                    owner=builder.make_group_urn(group),
                    type=OwnershipTypeClass.DATAOWNER,
                )
            ]
        ),
    )


def _tags(urn: str, *tags: str) -> MetadataChangeProposalWrapper:
    return MetadataChangeProposalWrapper(
        entityUrn=urn,
        aspect=GlobalTagsClass(
            tags=[TagAssociationClass(tag=builder.make_tag_urn(t)) for t in tags]
        ),
    )


def _column_lineage(
    downstream_urn: str,
    upstream_urn: str,
    column_pairs,
    transforms=None,
) -> MetadataChangeProposalWrapper:
    """Emit table lineage *plus* column-level fine-grained lineage.

    Column-level is the whole point: table-level impact analysis is
    unimpressive, column-level with the transform shown is impressive.
    """
    transforms = transforms or {}
    fine = []
    for up_col, down_col in column_pairs:
        fine.append(
            FineGrainedLineageClass(
                upstreamType=FineGrainedLineageUpstreamTypeClass.FIELD_SET,
                downstreamType=FineGrainedLineageDownstreamTypeClass.FIELD,
                upstreams=[builder.make_schema_field_urn(upstream_urn, up_col)],
                downstreams=[builder.make_schema_field_urn(downstream_urn, down_col)],
                transformOperation=transforms.get(down_col, "IDENTITY"),
                confidenceScore=1.0,
            )
        )
    return MetadataChangeProposalWrapper(
        entityUrn=downstream_urn,
        aspect=UpstreamLineageClass(
            upstreams=[
                UpstreamClass(dataset=upstream_urn, type=DatasetLineageTypeClass.TRANSFORMED)
            ],
            fineGrainedLineages=fine,
        ),
    )


def build_mcps():
    mcps = []

    # -- 1. warehouse tables ------------------------------------------------
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_RAW,
            aspect=DatasetPropertiesClass(
                name="user_transactions",
                description="Raw transaction ledger, replicated from the billing service.",
                customProperties={"source": "billing-service"},
            ),
        )
    )
    mcps.append(
        _schema(
            D_RAW,
            "postgres",
            [
                _field("user_id", "bigint", NumberTypeClass),
                _field("txn_id", "uuid", StringTypeClass),
                _field("created_at", "timestamptz", TimeTypeClass),
                _field("amount_usd", "numeric(18,2)", NumberTypeClass),
                _field("merchant_id", "bigint", NumberTypeClass),
                _field("disputed", "boolean", StringTypeClass),
            ],
        )
    )

    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_STG,
            aspect=DatasetPropertiesClass(
                name="stg_user_transactions",
                description=(
                    "Cleaned, deduplicated transactions. The single upstream for every "
                    "transaction-derived metric and feature in the warehouse."
                ),
                customProperties={
                    "dbt_model": "models/staging/stg_user_transactions.sql",
                    "tier": "Tier1",
                    "monthly_cost_usd": "340",
                },
            ),
        )
    )
    mcps.append(
        _schema(
            D_STG,
            "dbt",
            [
                _field("user_id", "bigint", NumberTypeClass, "Customer identifier."),
                _field("txn_id", "varchar", StringTypeClass, "Unique transaction id."),
                _field("txn_ts", "timestamp", TimeTypeClass, "Transaction timestamp, UTC."),
                _field(
                    "txn_amount_usd",
                    "numeric(18,2)",
                    NumberTypeClass,
                    "Transaction amount in USD. Feeds fraud_risk_v3 - do not rename.",
                ),
                _field("merchant_id", "bigint", NumberTypeClass),
                _field("is_disputed", "boolean", StringTypeClass),
            ],
        )
    )
    mcps.append(_owner(D_STG, "analytics-eng"))
    mcps.append(_tags(D_STG, "Tier1", "certified", "pii"))
    mcps.append(
        _column_lineage(
            D_STG,
            D_RAW,
            [
                ("user_id", "user_id"),
                ("txn_id", "txn_id"),
                ("created_at", "txn_ts"),
                ("amount_usd", "txn_amount_usd"),
                ("merchant_id", "merchant_id"),
                ("disputed", "is_disputed"),
            ],
            transforms={"txn_amount_usd": "CAST(amount_usd AS NUMERIC(18,2))"},
        )
    )

    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_INT,
            aspect=DatasetPropertiesClass(
                name="int_user_txns",
                description="Windowed transaction aggregates per user.",
                customProperties={"tier": "Tier2", "monthly_cost_usd": "280"},
            ),
        )
    )
    mcps.append(
        _schema(
            D_INT,
            "dbt",
            [
                _field("user_id", "bigint", NumberTypeClass),
                _field(
                    "velocity_calc",
                    "numeric",
                    NumberTypeClass,
                    "7-day rolling transaction volume. Source of user_txn_velocity_7d.",
                ),
                _field("txn_count_7d", "bigint", NumberTypeClass),
            ],
        )
    )
    mcps.append(_owner(D_INT, "analytics-eng"))
    mcps.append(
        _column_lineage(
            D_INT,
            D_STG,
            [("user_id", "user_id"), ("txn_amount_usd", "velocity_calc"), ("txn_id", "txn_count_7d")],
            transforms={
                "velocity_calc": (
                    "SUM(txn_amount_usd) OVER (PARTITION BY user_id ORDER BY txn_ts "
                    "RANGE BETWEEN INTERVAL '7 days' PRECEDING AND CURRENT ROW)"
                ),
                "txn_count_7d": "COUNT(txn_id) OVER (PARTITION BY user_id ...)",
            },
        )
    )

    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_FCT,
            aspect=DatasetPropertiesClass(
                name="fct_user_txn_features",
                description="Feature-serving mart. Materialised into the Feast online store.",
                customProperties={
                    "tier": "Tier1",
                    "domain": "ml-platform",
                    "monthly_cost_usd": "1900",
                },
            ),
        )
    )
    mcps.append(
        _schema(
            D_FCT,
            "dbt",
            [
                _field("user_id", "bigint", NumberTypeClass),
                _field(
                    "user_txn_velocity_7d",
                    "double",
                    NumberTypeClass,
                    "Serving column for the fraud_risk_v3 velocity feature.",
                ),
                _field("user_txn_amount_avg_30d", "double", NumberTypeClass),
                _field("feature_ts", "timestamp", TimeTypeClass),
            ],
        )
    )
    mcps.append(_owner(D_FCT, "ml-platform"))
    mcps.append(_tags(D_FCT, "Tier1", "ml-serving"))
    mcps.append(
        _column_lineage(
            D_FCT,
            D_INT,
            [("user_id", "user_id"), ("velocity_calc", "user_txn_velocity_7d")],
            transforms={
                "user_txn_velocity_7d": "CAST(velocity_calc AS DOUBLE) AS user_txn_velocity_7d"
            },
        )
    )

    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_REV,
            aspect=DatasetPropertiesClass(
                name="fct_revenue_daily",
                description="Daily revenue rollup behind the executive dashboard.",
                customProperties={"tier": "Tier1", "monthly_cost_usd": "1400"},
            ),
        )
    )
    mcps.append(
        _schema(
            D_REV,
            "dbt",
            [
                _field("revenue_date", "date", TimeTypeClass),
                _field("gross_revenue_usd", "numeric(18,2)", NumberTypeClass),
                _field("txn_count", "bigint", NumberTypeClass),
            ],
        )
    )
    mcps.append(_owner(D_REV, "finance-analytics"))
    mcps.append(_tags(D_REV, "Tier1", "certified"))
    mcps.append(
        _column_lineage(
            D_REV,
            D_STG,
            [("txn_amount_usd", "gross_revenue_usd"), ("txn_id", "txn_count")],
            transforms={"gross_revenue_usd": "SUM(txn_amount_usd) AS gross_revenue_usd"},
        )
    )

    # A deprecated, unowned dev table - the reverse-mode audit should flag it.
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_SCRATCH,
            aspect=DatasetPropertiesClass(
                name="TXN_PLAYGROUND",
                description="Ad-hoc scratch copy. Nobody owns this.",
                customProperties={"monthly_cost_usd": "12"},
            ),
        )
    )
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=D_SCRATCH,
            aspect=DeprecationClass(
                deprecated=True,
                note="Superseded by fct_user_txn_features.",
                actor="urn:li:corpuser:blast-radius",
            ),
        )
    )
    mcps.append(_column_lineage(D_SCRATCH, D_STG, [("txn_amount_usd", "AMOUNT")]))

    # -- 2. the ML slice ----------------------------------------------------
    # This is the half-day that turns a generic impact tool into a
    # Production ML Agents submission.
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=PK_USER,
            aspect=MLPrimaryKeyPropertiesClass(
                description="Entity key for the user risk feature table.",
                dataType="ORDINAL",
                sources=[D_FCT],
            ),
        )
    )
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=F_VELOCITY,
            aspect=MLFeaturePropertiesClass(
                description="7-day rolling transaction velocity per user.",
                dataType="CONTINUOUS",
                # THE edge that makes the demo: feature <- warehouse column.
                sources=[D_FCT],
            ),
        )
    )
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=F_AVG30,
            aspect=MLFeaturePropertiesClass(
                description="30-day average transaction amount per user.",
                dataType="CONTINUOUS",
                sources=[D_FCT],
            ),
        )
    )
    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=FEATURE_TABLE,
            aspect=MLFeatureTablePropertiesClass(
                description="Feast feature table serving the fraud models.",
                mlFeatures=[F_VELOCITY, F_AVG30],
                mlPrimaryKeys=[PK_USER],
            ),
        )
    )
    mcps.append(_owner(FEATURE_TABLE, "ml-platform"))

    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=MODEL,
            aspect=MLModelPropertiesClass(
                description=(
                    "Real-time fraud scoring model. Blocks transactions above the "
                    "risk threshold at authorisation time."
                ),
                customProperties={"auc": "0.947", "framework": "xgboost", "version": "3.4.1"},
                mlFeatures=[F_VELOCITY, F_AVG30],
                deployments=[DEPLOYMENT],
                trainingMetrics=[],
                hyperParams=[],
            ),
        )
    )
    mcps.append(_owner(MODEL, "fraud-ml"))
    mcps.append(_tags(MODEL, "production", "revenue-critical"))

    mcps.append(
        MetadataChangeProposalWrapper(
            entityUrn=DEPLOYMENT,
            aspect=MLModelDeploymentPropertiesClass(
                description="SageMaker real-time endpoint, us-east-1.",
                customProperties={
                    "requests_per_day": "40000",
                    "region": "us-east-1",
                    "instance": "ml.c6i.2xlarge",
                },
                status="IN_SERVICE" if hasattr(MLModelDeploymentPropertiesClass, "status") else None,
            ),
        )
    )
    mcps.append(_owner(DEPLOYMENT, "fraud-ml"))

    return [m for m in mcps if m is not None]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gms", default=os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080"))
    ap.add_argument("--token", default=os.environ.get("DATAHUB_GMS_TOKEN", ""))
    ap.add_argument("--dry-run", action="store_true", help="print the URNs, emit nothing")
    args = ap.parse_args()

    mcps = build_mcps()

    if args.dry_run:
        for mcp in mcps:
            print("%-28s %s" % (type(mcp.aspect).__name__, mcp.entityUrn))
        print("\n%d aspects (dry run, nothing emitted)" % len(mcps))
        return 0

    emitter = DatahubRestEmitter(gms_server=args.gms, token=args.token or None)
    try:
        emitter.test_connection()
    except Exception as exc:
        print("Cannot reach DataHub at %s: %s" % (args.gms, exc))
        print("Is it up?  datahub docker quickstart")
        return 2

    failed = 0
    for mcp in mcps:
        try:
            emitter.emit(mcp)
        except Exception as exc:
            failed += 1
            print("  FAILED %s on %s: %s" % (type(mcp.aspect).__name__, mcp.entityUrn, exc))

    print("\nEmitted %d/%d aspects to %s" % (len(mcps) - failed, len(mcps), args.gms))
    print("\nThe path that matters:")
    print("  stg_user_transactions.txn_amount_usd")
    print("    -> int_user_txns.velocity_calc")
    print("    -> fct_user_txn_features.user_txn_velocity_7d")
    print("    -> mlFeature user_txn_velocity_7d")
    print("    -> mlModel fraud_risk_v3")
    print("    -> mlModelDeployment fraud-risk-v3-prod  (40,000 req/day)")
    print("\nNow run:  blast-radius explain stg_user_transactions.txn_amount_usd --kind rename")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
