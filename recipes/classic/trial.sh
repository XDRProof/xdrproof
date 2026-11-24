#!/usr/bin/env bash
# trial.sh <name> <port> : fresh bare standalone stellar-core v30.0.0, run the classic recipes, split the meta
# stream into one LedgerCloseMeta file per ledger, remove the container.
# env NET=mainnet|testnet (default mainnet), FLAGS=base|galexie|bare (default base)
set -euo pipefail; cd "$(dirname "$0")"
NET="${NET:-mainnet}"; FLAGS="${FLAGS:-base}"
case "$NET" in mainnet) P="Public Global Stellar Network ; September 2015";; testnet) P="Test SDF Network ; September 2015";; *) echo "NET?" >&2; exit 2;; esac
trap 'docker rm -f "xdrproof-corpus-core-$1" >/dev/null 2>&1' EXIT   # set first: a core that fails to start is removed too
INFO=$(FLAGS="$FLAGS" ./run.sh "$1" "$2" "$P")
[ "$(echo "$INFO" | jq -r .build)" = "v30.0.0" ] || { echo "expected stellar-core v30.0.0 from recipes/core-image, got: $INFO" >&2; exit 1; }
printf '{"lane":"classic","net":"%s","passphrase":"%s","protocol":30,"flags":"%s","core":%s}\n' "$NET" "$P" "$FLAGS" "$(echo "$INFO" | jq -c .build)" > "runs/$1/run.json"
node gen.mjs "http://localhost:$2" "$P" "runs/$1/manifest.json" > "runs/$1/gen.log" 2>&1 || { tail -c 600 "runs/$1/gen.log"; exit 1; }
node ../soroban/extract.mjs "runs/$1" "runs/$1/lcm" >/dev/null
