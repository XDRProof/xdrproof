#!/usr/bin/env bash
# go.sh [-w dir] <command...>: run a command in the pinned Go toolchain image (linter/toolchain-image, Go 1.27.4
# on Debian bookworm, with gcc for cgo), with the repository at /xdrproof and a persistent module/build cache.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/.." && pwd)
dir=/xdrproof/linter
if [ "${1:-}" = -w ]; then dir=$2; shift 2; fi
docker volume create xdrproof-gocache-127 >/dev/null
exec docker run --rm -i -v "$REPO":/xdrproof -v xdrproof-gocache-127:/cache \
  -e GOCACHE=/cache/build -e GOMODCACHE=/cache/mod -e GOFLAGS=-buildvcs=false -e GOTOOLCHAIN=local -e CGO_ENABLED=1 \
  -w "$dir" "$(cat "$HERE/toolchain-image")" "$@"
