#!/usr/bin/env bash
# run.sh <run-name> <host-port> <passphrase>
set -euo pipefail
NAME="$1"; PORT="$2"; PASS="$3"; D="$(cd "$(dirname "$0")" && pwd)/runs/$NAME"
rm -rf "$D"; mkdir -p "$D"
sed "s/__NETWORK__/$PASS/" core.cfg.tmpl > "$D/core.cfg"
docker rm -f "xdrproof-corpus-core-$NAME" >/dev/null 2>&1 || true
docker run -d --name "xdrproof-corpus-core-$NAME" -p "$PORT:11626" -v "$D:/work" --entrypoint sh stellar/quickstart:latest -c \
 'mkdir -p /tmp/core && cd /tmp/core && stellar-core new-db --conf /work/core.cfg >/work/newdb.log 2>&1 && exec stellar-core run --conf /work/core.cfg >/work/run.log 2>&1' >/dev/null
for i in $(seq 1 60); do curl -sf "localhost:$PORT/info" >/dev/null 2>&1 && break; perl -e 'select(undef,undef,undef,0.5)'; done
curl -s "localhost:$PORT/info" | jq -c '.info | {state, ledger: .ledger.num, version: .ledger.version, network, build}'
