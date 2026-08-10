{{ config(materialized='table', tags=['tier1', 'certified']) }}

select
    date_trunc('day', txn_ts)     as revenue_date,
    sum(txn_amount_usd)           as gross_revenue_usd,
    count(txn_id)                 as txn_count
from {{ ref('stg_user_transactions') }}
group by 1
