#!/usr/bin/env bash
# Kept as the old entry point: the work is in recipes/regenerate.mjs (every generated run from scratch, twice each,
# compared pair by pair, every shipped generated variant reproduced). Env: PAR, QUICK=1.
exec node "$(dirname "$0")/regenerate.mjs" "$@"
