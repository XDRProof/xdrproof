#!/usr/bin/env bash
# Per session: a fresh database copied from the migrated template, and the two cursors wallet-backend
# reads at startup set to the ledger before the first one served, so live ingestion starts there.
. "$(dirname "$0")/common.sh"
psql_ -c "DROP DATABASE IF EXISTS $SDB WITH (FORCE)" >/dev/null
for i in 1 2 3 4 5; do
  # a copy fails while any session (TimescaleDB's scheduler included) is connected to the template
  psql_ -c "CREATE DATABASE $SDB TEMPLATE $TPL" >/dev/null 2>"$WORK/logs/prepare-$XDRPROOF_SESSION_ID.err" && break
  [ $i = 5 ] && { cat "$WORK/logs/prepare-$XDRPROOF_SESSION_ID.err" >&2; exit 1; }
  psql_ -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TPL'" >/dev/null; sleep 0.5
done
seed=$((XDRPROOF_FIRST_LEDGER - 1))
psql_ -d "$SDB" -c "INSERT INTO ingest_store(key,value) VALUES ('latest_ingest_ledger','$seed'),('oldest_ingest_ledger','$seed')" >/dev/null
