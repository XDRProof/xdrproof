#!/usr/bin/env bash
# Builds every testee at a pinned version from committed lockfiles and pinned images, then runs the corpus and the
# vectors through them (run.mjs) and prints the matrix. See conformance/README.md. Arguments go to run.mjs
# (--details, --fresh, --record, --only, --families, --format md, --profile).
# Needs: Node >= 22.15, Rust (cargo), Docker (builds and runs the Go and Python testees).
set -euo pipefail
cd "$(dirname "$0")"
W=.work; mkdir -p "$W/go"
# A live row while the builds are checked (and built when a pin changed), so the terminal is never blank. While it
# is drawn, what npm, cargo and docker print goes to a log instead of across the row, and is printed after it.
status="$W/.status"; prep="$W/prep.log"; : > "$status"; spin=""
if [ -t 2 ]; then
  node ../tools/wait.mjs "Preparing the SDK builds" "$status" & spin=$!
  exec 3>&1 4>&2 >"$prep" 2>&1
fi
stop_spin() {
  if [ -n "$spin" ]; then
    kill "$spin" 2>/dev/null || true; wait "$spin" 2>/dev/null || true; spin=""
    exec 1>&3 2>&4 3>&- 4>&-
    [ -s "$prep" ] && cat "$prep" >&2
  fi
  rm -f "$status" "$prep"
}
trap stop_spin EXIT
step() { echo "$1" > "$status"; }
npm_pin() { # npm_pin <work dir> <committed pin dir> <package> <version>: npm ci from the committed lockfile
  local have; have=$(node -p "require('./$W/$1/node_modules/$3/package.json').version" 2>/dev/null || true)
  [ "$have" = "$4" ] && return 0
  step "installing $3 $4"
  rm -rf "$W/$1" && mkdir -p "$W/$1" && cp "$2/package.json" "$2/package-lock.json" "$W/$1/"
  (cd "$W/$1" && npm ci --silent --no-audit --no-fund)
}
step "checking the pinned JS SDKs"
for v in 17.2.0 17.2.1 17.3.0 17.4.0; do npm_pin "js-$v" "testees/js/pins/$v" @stellar/stellar-sdk "$v"; done
npm_pin xdr-json-30.0.0 testees/xdr-json/pin @stellar/stellar-xdr-json 30.0.0
img_build() { # img_build <tag> <dir>: build only when the build context (every file, names included) changed
  local d; d=$(cd "$2" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -c1-16)
  [ "$(docker image inspect -f '{{index .Config.Labels "xdrproof.digest"}}' "$1" 2>/dev/null)" = "$d" ] && return 0
  step "building the ${1%%:*} image"
  docker build --quiet --label "xdrproof.digest=$d" -t "$1" "$2" >/dev/null
}
step "checking the Python images"
img_build xdrproof-testee-python:17.0.1 testees/python
img_build xdrproof-testee-python-xdr:0.2.1 testees/python-xdr
step "checking the Rust build"
cargo build --quiet --release --locked --manifest-path testees/rust/Cargo.toml --target-dir "$W/rust-target"
GO=(v0.7.1 v0.7.2 v0.9.0); missing=(); for v in "${GO[@]}"; do [ -x "$W/go/testee-go-$v" ] || missing+=("$v"); done
[ ${#missing[@]} -eq 0 ] || { step "building Go SDK ${missing[*]}"; docker run --rm --name xdrproof-conformance-go-build -v "$PWD/testees/go":/src:ro -v "$PWD/$W/go":/out \
  -v xdrproof-gocache:/cache -e GOMODCACHE=/cache/mod -e GOCACHE=/cache/build "$(cat testees/go/build-image)" sh /src/build.sh "${missing[@]}"; }
stop_spin; trap - EXIT
exec node run.mjs "$@"
