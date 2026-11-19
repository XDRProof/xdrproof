#!/usr/bin/env bash
# Builds every testee at a pinned version from committed lockfiles and pinned images, then runs the corpus and the
# vectors through them (run.mjs) and prints the matrix. See conformance/README.md. Arguments go to run.mjs
# (--record, --only, --families).
# Needs: Node >= 22.15, Rust (cargo), Docker (builds and runs the Go and Python testees).
set -euo pipefail
cd "$(dirname "$0")"
W=.work; mkdir -p "$W/go"
npm_pin() { # npm_pin <work dir> <committed pin dir> <package> <version>: npm ci from the committed lockfile
  local have; have=$(node -p "require('./$W/$1/node_modules/$3/package.json').version" 2>/dev/null || true)
  [ "$have" = "$4" ] && return 0
  rm -rf "$W/$1" && mkdir -p "$W/$1" && cp "$2/package.json" "$2/package-lock.json" "$W/$1/"
  (cd "$W/$1" && npm ci --silent --no-audit --no-fund)
}
for v in 17.2.0 17.2.1 17.3.0 17.4.0; do npm_pin "js-$v" "testees/js/pins/$v" @stellar/stellar-sdk "$v"; done
npm_pin xdr-json-30.0.0 testees/xdr-json/pin @stellar/stellar-xdr-json 30.0.0
docker build --quiet -t xdrproof-testee-python:17.0.1 testees/python >/dev/null
docker build --quiet -t xdrproof-testee-python-xdr:0.2.1 testees/python-xdr >/dev/null
cargo build --quiet --release --locked --manifest-path testees/rust/Cargo.toml --target-dir "$W/rust-target"
GO=(v0.7.1 v0.7.2 v0.9.0); missing=(); for v in "${GO[@]}"; do [ -x "$W/go/testee-go-$v" ] || missing+=("$v"); done
[ ${#missing[@]} -eq 0 ] || docker run --rm --name xdrproof-conformance-go-build -v "$PWD/testees/go":/src:ro -v "$PWD/$W/go":/out \
  -v xdrproof-gocache:/cache -e GOMODCACHE=/cache/mod -e GOCACHE=/cache/build "$(cat testees/go/build-image)" sh /src/build.sh "${missing[@]}"
exec node run.mjs "$@"
