#!/usr/bin/env bash
# The last ledger wallet-backend has committed (it writes the cursor in the transaction that commits the ledger).
. "$(dirname "$0")/common.sh"
psql_ -d "$SDB" -c "SELECT value FROM ingest_store WHERE key='latest_ingest_ledger'"
