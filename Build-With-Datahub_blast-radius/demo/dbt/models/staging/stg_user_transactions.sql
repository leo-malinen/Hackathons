{{ config(materialized='table', tags=['tier1', 'certified']) }}

-- The single upstream for every transaction-derived metric in the warehouse.
-- txn_amount_usd feeds fraud_risk_v3 through int_user_txns.velocity_calc.
-- Renaming it is the demo. Do not do it for real.

with source as (

    select * from {{ source('billing', 'user_transactions') }}

),

deduplicated as (

    select
        *,
        row_number() over (
            partition by txn_id order by created_at desc
        ) as _rn
    from source

)

select
    user_id,
    txn_id,
    created_at                          as txn_ts,
    cast(amount_usd as numeric(18, 2))  as txn_amount_usd,
    merchant_id,
    disputed                            as is_disputed
from deduplicated
where _rn = 1
