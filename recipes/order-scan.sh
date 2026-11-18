#!/usr/bin/env bash
# order-scan.sh <lane: classic|soroban> <runs> [protocol]   env NET (mainnet), FLAGS (base), PAR (6)
# Runs one recipe configuration <runs> times from scratch, then records which ledgers come out in more than one
# byte ordering (tools/order-scan.mjs) into recipes/<lane>/order-scan/p<protocol>-<net>-<flags>.json.
# Entries take change_order (stable, normalised hash, raw orderings) from this file.
set -euo pipefail
cd "$(dirname "$0")"
LANE="$1"; N="$2"; PROTO="${3:-30}"; NET="${NET:-mainnet}"; FLAGS="${FLAGS:-base}"
[ "$LANE" = classic ] && [ "$PROTO" != 30 ] && { echo "the classic lane runs at P30 only" >&2; exit 2; }
CFG="p$PROTO-$NET-$FLAGS"; BASE=21800; [ "$LANE" = soroban ] && BASE=21900
JOBS=$(mktemp); trap 'rm -f "$JOBS"' EXIT
for i in $(seq -w 1 "$N"); do echo "os-$CFG-$i $((BASE + 10#$i))" >> "$JOBS"; done
echo "$LANE $CFG: $N fresh runs, ${PAR:-6} at a time"
LANE="$LANE" PROTO="$PROTO" NET="$NET" FLAGS="$FLAGS" xargs -P "${PAR:-6}" -L1 sh -c '
  if [ "$LANE" = classic ]; then classic/trial.sh "$0" "$1" >/dev/null; else soroban/trial.sh "$0" "$1" "$PROTO" >/dev/null; fi \
    || { echo "  FAILED $0"; exit 255; }' < "$JOBS"
mkdir -p "$LANE/order-scan"
# shellcheck disable=SC2046
node ../tools/order-scan.mjs "$LANE/order-scan/$CFG.json" $(for i in $(seq -w 1 "$N"); do echo "$LANE/runs/os-$CFG-$i/lcm"; done)
