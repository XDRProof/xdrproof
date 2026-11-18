#!/usr/bin/env bash
# Runs the conformance prototype: the same vectors through pinned builds of the JS, Rust and Go SDKs,
# each as a "testee" process speaking line-delimited JSON, and prints the divergence matrix.
#
# Reproduces the RFP's runner check: js-stellar-sdk #1766, #1785 and #1789 fail on pre-fix tags and
# pass on fixed ones; #1766 also fails on go-stellar-sdk v0.7.1 and passes on v0.7.2.
# Needs: Node >= 22, Rust (cargo), Docker (builds and runs the Go testees in golang/alpine images).
set -euo pipefail
cd "$(dirname "$0")"
W=.work; mkdir -p "$W/go"
JS=(17.2.0 17.2.1 17.3.0); GO=(v0.7.1 v0.7.2 v0.9.0)

for v in "${JS[@]}"; do
  [ -d "$W/js-$v/node_modules/@stellar/stellar-sdk" ] && continue
  mkdir -p "$W/js-$v" && echo '{"private":true}' > "$W/js-$v/package.json"
  npm install --prefix "$W/js-$v" --silent --no-audit --no-fund "@stellar/stellar-sdk@$v"
done
cargo build --quiet --release --manifest-path testees/rust/Cargo.toml --target-dir "$W/rust-target"
missing=(); for v in "${GO[@]}"; do [ -x "$W/go/testee-go-$v" ] || missing+=("$v"); done
[ ${#missing[@]} -eq 0 ] || docker run --rm --name xdrproof-conformance-go-build -v "$PWD/testees/go":/src:ro -v "$PWD/$W/go":/out \
  -v xdrproof-gocache:/cache -e GOMODCACHE=/cache/mod -e GOCACHE=/cache/build golang:1.25-alpine sh /src/build.sh "${missing[@]}"

H=$PWD; specs=()
for v in "${JS[@]}"; do specs+=("js@$v=node $H/testees/js/testee.cjs $H/$W/js-$v"); done
specs+=("rust@30.0.0=$H/$W/rust-target/release/xdrproof-testee-rust")
for v in "${GO[@]}"; do specs+=("go@$v=docker run --rm -i -v $H/$W/go:/out:ro alpine:3.22 /out/testee-go-$v"); done
(cd "$W" && node "$H/orchestrator.mjs" "$H/vectors/sightings.json" "${specs[@]}" >/dev/null)
cat "$W/matrix.md"
if diff -q "$W/matrix.md" recorded/matrix-sightings.md >/dev/null; then
  echo; echo "OK: matrix identical to the recorded run (recorded/matrix-sightings.md)."
else
  echo; echo "DIFFERS from the recorded run:"; diff "$W/matrix.md" recorded/matrix-sightings.md || true; exit 1
fi
