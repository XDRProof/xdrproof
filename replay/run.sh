#!/usr/bin/env bash
# make replay: the whole corpus against wallet-backend main, then every sighting at the commits before and
# after its fix (replay/sightings.json). Every verdict must match replay/expectations/. Writes the recorded
# matrix to replay/recorded/wallet-backend.md. Needs Docker, Node >= 22.15 and the native reader.
#   replay/run.sh [all|main|sightings] [harness options, e.g. --jobs 8]
set -uo pipefail
cd "$(dirname "$0")/.."
what=${1:-all}; shift || true
fail=0
if [ "$what" = all ] || [ "$what" = main ]; then
  node replay/harness.mjs --adapter wallet-backend --target main "$@" || fail=1
fi
if [ "$what" = all ] || [ "$what" = sightings ]; then
  for t in $(node -e 'const s=require("./replay/sightings.json").sightings; console.log([...new Set(s.flatMap((x) => Object.keys(x.verdicts)))].join(" "))'); do
    node replay/harness.mjs --adapter wallet-backend --target "$t" --sightings "$@" || fail=1
  done
fi
mkdir -p replay/recorded
node replay/matrix.mjs wallet-backend > replay/recorded/wallet-backend.md
[ $fail = 0 ] && echo "OK: every replay verdict matches replay/expectations/." || echo "MISMATCH: see the runs above (replay/runs/)."
exit $fail
