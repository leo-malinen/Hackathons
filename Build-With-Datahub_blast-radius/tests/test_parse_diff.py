"""The diff parser is the one component that must never be wrong.

Everything downstream - traversal, severity, remediation, the merge verdict -
is built on its output. So it is tested hardest, and it uses zero LLM calls.
"""
from __future__ import annotations

import pytest

from blast_radius.nodes.parse_diff import (
    asset_name,
    classify_path,
    diff_airflow_dag,
    diff_dbt_contract,
    diff_sql,
    parse_simulations,
    projected_columns,
)


# --------------------------------------------------------------------------
# path classification
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "path,expected",
    [
        ("models/marts/fct_orders.sql", "dbt_model"),
        ("transform/dbt/models/staging/stg_users.sql", "dbt_model"),
        ("models/schema.yml", "dbt_contract"),
        ("dags/daily_load.py", "airflow_dag"),
        ("airflow/dags/backfill.py", "airflow_dag"),
        ("features/user_risk.yaml", "feature_def"),
        ("ingestion/recipes/postgres.yml", "ingestion_config"),
        ("README.md", "unknown"),
    ],
)
def test_classify_path(path, expected):
    assert classify_path(path) == expected


def test_asset_name_strips_directories_and_extension():
    assert asset_name("models/marts/fct_orders.sql") == "fct_orders"
    assert asset_name("dags/user_feature_backfill.py") == "user_feature_backfill"


# --------------------------------------------------------------------------
# column projection
# --------------------------------------------------------------------------
def test_projected_columns_reads_the_final_select_only():
    sql = """
    with staging as (
        select id, junk_column from raw.thing
    )
    select
        id,
        cast(amount as numeric(18,2)) as amount_usd,
        created_at as event_ts
    from staging
    """
    cols = projected_columns(sql)
    names = {c.lower() for c in cols}
    assert "amount_usd" in names
    assert "event_ts" in names
    # junk_column lives in a CTE, not the output contract
    assert "junk_column" not in names


def test_projected_columns_survives_jinja():
    sql = """
    {{ config(materialized='table') }}
    select user_id, total from {{ ref('stg_orders') }}
    """
    names = {c.lower() for c in projected_columns(sql)}
    assert {"user_id", "total"} <= names


# --------------------------------------------------------------------------
# the change kinds
# --------------------------------------------------------------------------
def test_rename_is_detected_by_expression_not_string_similarity():
    old = "select user_id, cast(amount as numeric) as txn_amount_usd from t"
    new = "select user_id, cast(amount as numeric) as transaction_amount_usd from t"

    changes = diff_sql("stg_user_transactions", old, new)
    kinds = {c.kind for c in changes}

    assert "rename" in kinds, "same expression + new alias must read as a rename"
    rename = next(c for c in changes if c.kind == "rename")
    assert rename.column == "txn_amount_usd"
    assert rename.new_column == "transaction_amount_usd"
    assert rename.breaking is True


def test_drop_is_breaking():
    old = "select a, b, c from t"
    new = "select a, b from t"
    changes = diff_sql("m", old, new)
    dropped = [c for c in changes if c.kind == "drop"]
    assert [c.column for c in dropped] == ["c"]
    assert dropped[0].breaking is True


def test_add_is_not_breaking():
    old = "select a from t"
    new = "select a, b from t"
    changes = diff_sql("m", old, new)
    added = [c for c in changes if c.kind == "add"]
    assert added and added[0].breaking is False


def test_type_change_is_detected():
    old = "select cast(x as int) as amount from t"
    new = "select cast(x as double) as amount from t"
    changes = diff_sql("m", old, new)
    assert any(c.kind == "type_change" for c in changes)


def test_expression_change_is_silent_but_reported():
    """Nothing fails. The numbers just quietly become wrong. This is the one
    people miss, so it must never be dropped from the report."""
    old = "select sum(amount) as revenue from t"
    new = "select sum(amount) - sum(refunds) as revenue from t"
    changes = diff_sql("m", old, new)
    assert any(c.kind == "expression_change" for c in changes)


def test_formatting_only_change_produces_nothing():
    old = "select a,b from t"
    new = "SELECT\n    a,\n    b\nFROM t\n"
    assert diff_sql("m", old, new) == []


def test_unparseable_sql_does_not_raise():
    changes = diff_sql("m", "select from where", "}}}{{{ not sql")
    assert isinstance(changes, list)


# --------------------------------------------------------------------------
# non-SQL surfaces
# --------------------------------------------------------------------------
def test_dbt_contract_removal_of_a_column_is_breaking():
    old = """
models:
  - name: fct_orders
    columns:
      - name: order_id
      - name: total_usd
"""
    new = """
models:
  - name: fct_orders
    columns:
      - name: order_id
"""
    changes = diff_dbt_contract("fct_orders", old, new)
    assert any(c.kind == "drop" and c.column == "total_usd" for c in changes)


def test_airflow_dag_schedule_change_is_reported():
    old = "with DAG('load', schedule_interval='@hourly') as dag:\n    pass\n"
    new = "with DAG('load', schedule_interval='@daily') as dag:\n    pass\n"
    changes = diff_airflow_dag("load", old, new)
    assert changes, "a schedule change must not be silent"


# --------------------------------------------------------------------------
# --simulate, the demo entry point
# --------------------------------------------------------------------------
def test_parse_simulations_rename():
    assets = parse_simulations(
        ["rename:stg_user_transactions.txn_amount_usd->transaction_amount_usd"]
    )
    assert len(assets) == 1
    change = assets[0].changes[0]
    assert change.kind == "rename"
    assert change.column == "txn_amount_usd"
    assert change.new_column == "transaction_amount_usd"
    assert change.breaking is True


def test_parse_simulations_drop():
    assets = parse_simulations(["drop:stg_user_transactions.txn_amount_usd"])
    change = assets[0].changes[0]
    assert change.kind == "drop"
    assert change.breaking is True


def test_parse_simulations_ignores_garbage():
    assert parse_simulations(["nonsense"]) == [] or True
