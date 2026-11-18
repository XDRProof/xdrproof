#!/usr/bin/env bash
# trial.sh <name> <port> <protocol> [high-limit-override]
# Fresh standalone core -> recipe -> per-ledger LCM files in runs/<name>/lcm -> container removed.
set -euo pipefail; cd "$(dirname "$0")"
P="Public Global Stellar Network ; September 2015"
./run.sh "$1" "$2" "$P" "${4:-true}"
trap '[ -n "${KEEP:-}" ] || docker rm -f "xdrproof-soroban-$1" >/dev/null 2>&1' EXIT
node gen/gen.mjs "http://localhost:$2" "$P" "$3" "runs/$1/manifest.json" > "runs/$1/gen.log" 2>&1 || { tail -c 600 "runs/$1/gen.log"; exit 1; }
node extract.mjs "runs/$1" "runs/$1/lcm"
