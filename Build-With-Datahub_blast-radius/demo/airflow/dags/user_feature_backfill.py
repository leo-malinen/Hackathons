"""Nightly re-materialisation of the fraud feature mart.

This is the "1 Airflow DAG" in the demo headline. It reads txn_amount_usd
directly, so a rename in the staging model breaks it at runtime, not at
compile time - which is exactly why a pre-merge firewall is worth having.
"""
from __future__ import annotations

import pendulum
from airflow.decorators import dag, task
from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator

FEATURE_SQL = """
insert overwrite analytics.marts.fct_user_txn_features
select
    user_id,
    cast(velocity_calc as double)  as user_txn_velocity_7d,
    cast(avg_amount_30d as double) as user_txn_amount_avg_30d,
    current_timestamp              as feature_ts
from analytics.intermediate.int_user_txns
where txn_amount_usd is not null
"""


@dag(
    dag_id="user_feature_backfill",
    schedule="0 2 * * *",
    start_date=pendulum.datetime(2024, 1, 1, tz="UTC"),
    catchup=False,
    tags=["ml", "features", "tier1"],
)
def user_feature_backfill():
    compute_velocity_features = SQLExecuteQueryOperator(
        task_id="compute_velocity_features",
        conn_id="warehouse",
        sql=FEATURE_SQL,
    )

    @task
    def push_to_online_store() -> None:
        """Materialise into Feast so fraud_risk_v3 serves fresh features."""
        from feast import FeatureStore

        FeatureStore(repo_path="feature_repo").materialize_incremental(
            end_date=pendulum.now("UTC")
        )

    compute_velocity_features >> push_to_online_store()


user_feature_backfill()
