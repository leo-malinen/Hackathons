#!/usr/bin/env bash
# Open the deliberately dangerous PR that the firewall is supposed to block.
#
#   ./scripts/demo_pr.sh
#
# Requires: gh CLI, authenticated, inside a git repo with a remote.
set -euo pipefail

BRANCH="demo/rename-txn-amount-$(date +%s)"
MODEL="demo/dbt/models/staging/stg_user_transactions.sql"

echo "==> branching $BRANCH"
git checkout -b "$BRANCH"

echo "==> renaming txn_amount_usd -> transaction_amount_usd (one word, one line)"
sed -i.bak 's/as txn_amount_usd/as transaction_amount_usd/' "$MODEL"
rm -f "$MODEL.bak"

git add "$MODEL"
git commit -m "chore: rename txn_amount_usd to transaction_amount_usd for clarity"
git push -u origin "$BRANCH"

gh pr create \
  --title "chore: rename txn_amount_usd to transaction_amount_usd" \
  --body "Small naming cleanup for consistency with the new style guide. Should be harmless." \
  --base main

echo
echo "==> PR opened. Watch the Blast Radius check run."
echo "    It should fail, name fraud_risk_v3, and open a companion migration PR."
