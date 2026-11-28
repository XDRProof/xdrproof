#!/usr/bin/env bash
# tools/ci/changes.sh: which deep suites a change can affect, for the "deep checks" workflow. Prints
# "conformance=true|false" and "replay=true|false" (one per line, for $GITHUB_OUTPUT). Anything it cannot work out
# (a scheduled or manual run, a first push, a git error) runs every suite: a missed suite is worse than a slow run.
#   tools/ci/changes.sh <event> <base-sha> <head-sha>
set -uo pipefail
event=${1:-}; base=${2:-}; head=${3:-}
all() { echo "conformance=true"; echo "replay=true"; exit 0; }
case "$event" in pull_request|push) ;; *) all ;; esac
[[ "$base" =~ ^[0-9a-f]{40}$ && "$head" =~ ^[0-9a-f]{40}$ && "$base" != 0000000000000000000000000000000000000000 ]] || all
# renames count as a delete plus an add, so both the old and the new path are seen
files=$(git diff --name-only --no-renames "$base" "$head" 2>/dev/null) || all
shared='^(catalog|entries|mined|schema|tools|recipes)/|^(manifest\.json|Makefile)$|^\.github/workflows/deep\.yml$'
hit() { grep -qE "$shared|$1" <<<"$files" && echo true || echo false; }
echo "conformance=$(hit '^conformance/')"
echo "replay=$(hit '^replay/')"
