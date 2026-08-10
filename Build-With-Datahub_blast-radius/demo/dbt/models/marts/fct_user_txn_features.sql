{{ config(materialized='table', tags=['tier1', 'ml-serving']) }}

-- Materialised into the Feast online store. Every column here is a
-- production ML feature; treat the schema as an API contract.

select
    user_id,
    cast(velocity_calc as double)     as user_txn_velocity_7d,
    cast(avg_amount_30d as double)    as user_txn_amount_avg_30d,
    current_timestamp                 as feature_ts
from {{ ref('int_user_txns') }}
