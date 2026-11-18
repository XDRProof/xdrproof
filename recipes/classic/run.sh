#!/usr/bin/env bash
# run.sh <run-name> <host-port> <passphrase>   env FLAGS=base|galexie|bare (default base, see ../flags/)
set -euo pipefail
NAME="$1"; PORT="$2"; PASS="$3"; FLAGS="${FLAGS:-base}"
HERE="$(cd "$(dirname "$0")" && pwd)"; D="$HERE/runs/$NAME"; F="$HERE/../flags/$FLAGS.cfg"
[ -f "$F" ] || { echo "unknown FLAGS profile: $FLAGS" >&2; exit 2; }
rm -rf "$D"; mkdir -p "$D"
sed "s/__NETWORK__/$PASS/" "$HERE/core.cfg.tmpl" | awk -v f="$F" '/^__FLAGS__$/{while((getline l < f)>0) if (l !~ /^#/) print l; next} {print}' > "$D/core.cfg"
docker rm -f "xdrproof-corpus-core-$NAME" >/dev/null 2>&1 || true
docker run -d --name "xdrproof-corpus-core-$NAME" -p "$PORT:11626" -v "$D:/work" --entrypoint sh "$(cat "$(dirname "$0")/../core-image")" -c \
 'mkdir -p /tmp/core && cd /tmp/core && stellar-core new-db --conf /work/core.cfg >/work/newdb.log 2>&1 && exec stellar-core run --conf /work/core.cfg >/work/run.log 2>&1' >/dev/null
for i in $(seq 1 60); do curl -sf "localhost:$PORT/info" >/dev/null 2>&1 && break; perl -e 'select(undef,undef,undef,0.5)'; done
curl -s "localhost:$PORT/info" | jq -c '.info | {state, ledger: .ledger.num, version: .ledger.version, network, build}'
