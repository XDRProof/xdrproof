#!/usr/bin/env bash
# Regenerates every generated run from scratch, twice each, with a bare standalone stellar-core v30.0.0
# (no RPC, no network, no keys or funds): both lanes, both passphrases, Soroban at P30 and P28, and the
# galexie and bare emitter-flag profiles. Each pair must agree (byte-identical, or the same content after
# change-order normalisation), and every shipped generated variant must be reproduced; the list of shipped
# variants is read from entries/*/entry.json (tools/shipped-checks.mjs).
#
# Needs: Docker (the stellar/quickstart image pinned by digest in recipes/core-image supplies stellar-core v30.0.0), Node >= 22.15, curl, jq.
# Env: PAR=<n> fresh cores at once (default 6). QUICK=1 runs only the mainnet base P30 pairs.
set -euo pipefail
cd "$(dirname "$0")"
[ -d classic/node_modules ] || (cd classic && npm install --silent --no-audit --no-fund)
[ -d soroban/gen/node_modules ] || (cd soroban/gen && npm install --silent --no-audit --no-fund)
[ -d ../tools/node_modules ] || (cd ../tools && npm install --silent --no-audit --no-fund)

JOBS=$(mktemp); trap 'rm -f "$JOBS"' EXIT; PORT=21700; PAIRS=()
add() { # add <lane> <protocol> <net> <flags>
  local tag="$1-p$2-$3-$4"; PAIRS+=("$1 $2 $3 $4 $tag")
  for r in 1 2; do echo "$1 g-$tag-$r $PORT $2 $3 $4" >> "$JOBS"; PORT=$((PORT + 1)); done
}
add classic 30 mainnet base
add soroban 30 mainnet base
if [ -z "${QUICK:-}" ]; then
  add classic 30 testnet base;   add classic 30 mainnet galexie; add classic 30 mainnet bare
  add soroban 30 testnet base;   add soroban 28 mainnet base;    add soroban 28 testnet base
  add soroban 30 mainnet galexie; add soroban 30 mainnet bare
fi
echo "$(wc -l < "$JOBS" | tr -d ' ') fresh runs, ${PAR:-6} at a time"
xargs -P "${PAR:-6}" -L1 sh -c '
  lane=$0 name=$1 port=$2 proto=$3 net=$4 flags=$5
  if [ "$lane" = classic ]; then NET=$net FLAGS=$flags classic/trial.sh "$name" "$port" >/dev/null
  else NET=$net FLAGS=$flags soroban/trial.sh "$name" "$port" "$proto" >/dev/null; fi \
    && echo "  ran $name" || { echo "  FAILED $name (see $lane/runs/$name/gen.log)"; exit 255; }' < "$JOBS"

FAIL=0; CONFIGS=()
for p in "${PAIRS[@]}"; do
  read -r lane proto net flags tag <<< "$p"
  CONFIGS+=("$lane $proto $net $flags")
  echo "$lane P$proto $net $flags"
  CHECKS=$(node ../tools/shipped-checks.mjs "$lane" "$proto" "$net" "$flags") || { echo "  shipped-checks failed"; FAIL=1; continue; }
  # shellcheck disable=SC2086
  if ! node ../tools/compare.mjs "$lane/runs/g-$tag-1/lcm" "$lane/runs/g-$tag-2/lcm" $CHECKS > "$lane/runs/g-$tag-compare.txt"; then FAIL=1; fi
  grep -E "ledgers:|@|DIFFERS|missing|only in" "$lane/runs/g-$tag-compare.txt" || true
done
# every shipped generated variant must have been checked by some pair (QUICK runs only part of the matrix)
if [ -z "${QUICK:-}" ]; then node ../tools/shipped-checks.mjs --assigned "${CONFIGS[@]}" || FAIL=1; fi
# the same ledger under the three flag profiles: same header hash, different meta (H-F9), recorded per lane
if [ -z "${QUICK:-}" ]; then for lane in classic soroban; do
  node ../tools/profile-compare.mjs "$lane/profiles/p30-mainnet.json" base="$lane/runs/g-$lane-p30-mainnet-base-1/lcm" \
    galexie="$lane/runs/g-$lane-p30-mainnet-galexie-1/lcm" bare="$lane/runs/g-$lane-p30-mainnet-bare-1/lcm" || FAIL=1
done; fi
[ "$FAIL" = 0 ] && echo "OK: every run reproduced; every shipped generated variant reproduced" || { echo "FAILED"; exit 1; }
