#!/usr/bin/env bash
# trial.sh <name> <port> : fresh bare standalone stellar-core v30.0.0 on the mainnet passphrase,
# run the classic recipes, split the meta stream into one LedgerCloseMeta file per ledger, remove the container.
set -euo pipefail; cd "$(dirname "$0")"
P="Public Global Stellar Network ; September 2015"
./run.sh "$1" "$2" "$P" >/dev/null
trap 'docker rm -f "xdrproof-corpus-core-$1" >/dev/null 2>&1' EXIT
node gen.mjs "http://localhost:$2" "$P" "runs/$1/manifest.json" > "runs/$1/gen.log" 2>&1 || { tail -c 600 "runs/$1/gen.log"; exit 1; }
node ../soroban/extract.mjs "runs/$1" "runs/$1/lcm" >/dev/null
