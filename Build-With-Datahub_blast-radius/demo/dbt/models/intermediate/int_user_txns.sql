{{ config(materialized='incremental', unique_key='user_id') }}

-- velocity_calc is the intermediate hop the PR comment names explicitly.

select
    user_id,

    sum(txn_amount_usd) over (
        partition by user_id
        order by txn_ts
        range between interval '7 days' preceding and current row
    ) as velocity_calc,

    count(txn_id) over (
        partition by user_id
        order by txn_ts
        range between interval '7 days' preceding and current row
    ) as txn_count_7d

from {{ ref('stg_user_transactions') }}
