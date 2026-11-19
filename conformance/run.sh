#!/usr/bin/env bash
# Builds every testee at a pinned version, then runs the corpus and the vectors through them (run.mjs) and prints
# the matrix. See conformance/README.md. Arguments go to run.mjs (--record, --only, --families).
# Needs: Node >= 22.15, Rust (cargo), Docker (builds and runs the Go and Python testees in pinned images).
set -euo pipefail
cd "$(dirname "$0")"
W=.work; mkdir -p "$W/go"
JS=(17.2.0 17.2.1 17.3.0 17.4.0); GO=(v0.7.1 v0.7.2 v0.9.0); PY=17.0.1; XJ=30.0.0
npm_pin() { # npm_pin <dir> <package@version>
  [ -d "$W/$1/node_modules/${2%@*}" ] && return 0
  mkdir -p "$W/$1" && echo '{"private":true}' > "$W/$1/package.json"
  npm install --prefix "$W/$1" --silent --no-audit --no-fund --save-exact "$2"
}
for v in "${JS[@]}"; do npm_pin "js-$v" "@stellar/stellar-sdk@$v"; done
npm_pin "xdr-json-$XJ" "@stellar/stellar-xdr-json@$XJ"
docker build --quiet --build-arg "SDK=$PY" -t "xdrproof-testee-python:$PY" testees/python >/dev/null # pinned interpreter image, see its Dockerfile
docker build --quiet -t xdrproof-testee-python-xdr:0.2.1 testees/python-xdr >/dev/null # stellar-xdr 0.2.1 + stellar-strkey 0.2.0, see its Dockerfile
cargo build --quiet --release --manifest-path testees/rust/Cargo.toml --target-dir "$W/rust-target"
missing=(); for v in "${GO[@]}"; do [ -x "$W/go/testee-go-$v" ] || missing+=("$v"); done
[ ${#missing[@]} -eq 0 ] || docker run --rm --name xdrproof-conformance-go-build -v "$PWD/testees/go":/src:ro -v "$PWD/$W/go":/out \
  -v xdrproof-gocache:/cache -e GOMODCACHE=/cache/mod -e GOCACHE=/cache/build golang:1.25-alpine sh /src/build.sh "${missing[@]}"
exec node run.mjs "$@"
