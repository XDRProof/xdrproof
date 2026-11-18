#!/usr/bin/env bash
# run.sh <run-name> <host-port> <passphrase> [high-limit-override: true|false]
# Starts one bare standalone stellar-core (from the quickstart image) in container xdrproof-soroban-<run-name>.
set -euo pipefail
cd "$(dirname "$0")"
NAME="$1"; PORT="$2"; PASS="$3"; HIGH="${4:-true}"; D="$PWD/runs/$NAME"
rm -rf "$D"; mkdir -p "$D"
sed -e "s/__NETWORK__/$PASS/" -e "s/__HIGH__/$HIGH/" core.cfg.tmpl > "$D/core.cfg"
docker rm -f "xdrproof-soroban-$NAME" >/dev/null 2>&1 || true
docker run -d --name "xdrproof-soroban-$NAME" -p "$PORT:11626" -v "$D:/work" --entrypoint sh stellar/quickstart:latest -c \
 'mkdir -p /tmp/core && cd /tmp/core && stellar-core new-db --conf /work/core.cfg >/work/newdb.log 2>&1 && exec stellar-core run --conf /work/core.cfg >/work/run.log 2>&1' >/dev/null
for i in $(seq 1 60); do curl -sf "localhost:$PORT/info" >/dev/null 2>&1 && break; perl -e 'select(undef,undef,undef,0.5)'; done
curl -s "localhost:$PORT/info" | jq -c '.info | {state, ledger: .ledger.num, version: .ledger.version, network, build}'
