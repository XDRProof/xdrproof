#!/usr/bin/env bash
# order-scan.sh <lane: classic|soroban> <runs> [protocol]   env NET (mainnet), FLAGS (base), PAR (6)
# Kept as the old entry point: the work is in recipes/order-scan.mjs.
exec node "$(dirname "$0")/order-scan.mjs" "$@"
