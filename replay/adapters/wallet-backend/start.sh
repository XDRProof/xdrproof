#!/usr/bin/env bash
# Per session: wallet-backend live ingestion from the mock RPC, in the foreground. The harness owns the
# process; its exit code is the container's.
. "$(dirname "$0")/common.sh"
exec docker run --rm --name "xdrproof-wb-$XDRPROOF_SESSION_ID" --network "$NET" --add-host=host.docker.internal:host-gateway \
  --memory "${XDRPROOF_MEMORY_MB}m" --memory-swap "${XDRPROOF_MEMORY_MB}m" \
  -v "$BIN":/wb:ro \
  -e DATABASE_URL="postgres://postgres@$DB:5432/$SDB?sslmode=disable" \
  -e RPC_URL="$XDRPROOF_RPC_URL_DOCKER" -e ARCHIVE_URL="$XDRPROOF_ARCHIVE_URL_DOCKER" \
  -e NETWORK="$XDRPROOF_NETWORK" -e NETWORK_PASSPHRASE="$XDRPROOF_NETWORK_PASSPHRASE" \
  -e LEDGER_BACKEND_TYPE=rpc -e INGESTION_MODE=live -e STELLAR_ENVIRONMENT=xdrproof -e LOG_LEVEL=INFO \
  "$RUN_IMAGE" /wb ingest
