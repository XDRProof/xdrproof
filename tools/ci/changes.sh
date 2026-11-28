#!/usr/bin/env bash
# tools/ci/changes.sh: which deep suites a change can affect, for the "deep checks" workflow. Prints
# "conformance=true|false" and "replay=true|false", one per line, for $GITHUB_OUTPUT. Anything it cannot work out
# (a scheduled or manual run, a first push, a git error) runs every suite: a missed suite is worse than a slow run.
#   tools/ci/changes.sh <event> <base-sha> <head-sha>
set -u
event=${1:-}; base=${2:-}; head=${3:-}
all() { echo "conformance=true"; echo "replay=true"; exit 0; }
case "$event" in pull_request|push) ;; *) all ;; esac
[[ "$base" =~ ^[0-9a-f]{40}$ && "$head" =~ ^[0-9a-f]{40}$ && "$base" != 0000000000000000000000000000000000000000 ]] || all
# what both suites read: the corpus and its sources, the shared tools and build, and the checkout's own settings
shared=(catalog entries mined schema tools recipes manifest.json Makefile .github/workflows/deep.yml
        rust-toolchain rust-toolchain.toml .cargo .gitattributes .nvmrc .node-version)
# git diff --quiet exits 1 when the paths changed, 0 when they did not, anything else on an error; renames count as a
# delete plus an add, so both the old and the new path are seen. Pathspecs match quoted and non-ASCII names too.
changed() {
  git -c core.quotePath=false diff --quiet --no-renames "$base" "$head" -- "${shared[@]}" "$@"
  case $? in 0) echo false ;; 1) echo true ;; *) all ;; esac
}
c=$(changed conformance) || all; r=$(changed replay) || all
[[ "$c" == true || "$c" == false ]] && [[ "$r" == true || "$r" == false ]] || all
echo "conformance=$c"
echo "replay=$r"
