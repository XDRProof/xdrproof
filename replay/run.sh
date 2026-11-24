#!/usr/bin/env bash
# make replay: the whole corpus against wallet-backend main, then every sighting at the commits before and after
# its fix. The work is done by replay/run.mjs (one harness run per target, a live block while it runs, proof cards
# at the end); this script stays as the entry point the Makefile and the docs name.
#   replay/run.sh [all|main|sightings] [--details] [harness options, e.g. --jobs 8]
cd "$(dirname "$0")/.." && exec node replay/run.mjs "$@"
