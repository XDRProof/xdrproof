# XDRProof. Each target re-runs a claim and prints its result.
# Fast and offline:   make verify   make coverage
# Need Docker:        make generate   make conformance   make replay
.PHONY: verify coverage coverage-goldens generate conformance replay replay-729 replay-731 native all

NATIVE := tools/native/target/release/xdrproof-native

verify: tools/node_modules $(NATIVE)  ## schema, hazards, sha256, native rs-stellar-xdr round trip, focus, every fact (seconds)
	node tools/verify.mjs

coverage:                             ## arms reachable from LedgerCloseMeta vs arms the entries reach (seconds)
	tools/coverage/run.sh

coverage-goldens:                     ## same, plus stellar-core's own golden ledgers (downloads ~76 MB once)
	GOLDENS=1 tools/coverage/run.sh

generate: tools/node_modules          ## regenerate the generated entries twice from a bare stellar-core (~2 min)
	recipes/regenerate.sh

conformance:                          ## js-stellar-sdk #1766 #1785 #1789 + go-stellar-sdk twin (~5 min cold)
	conformance/run.sh

replay: replay-729 replay-731         ## every wallet-backend sighting

replay-729:                           ## wallet-backend #729 halted / #716 mishandled / fixed handled (~8 min cold)
	replay/run.sh 729

replay-731:                           ## wallet-backend #731 dropped / fixed handled, on XDRProof's own CAP-0073 entry (~2 min cold)
	replay/run.sh 731

native: $(NATIVE)                     ## build the native rs-stellar-xdr reader (~1 min once)

all: verify coverage generate conformance replay

$(NATIVE): tools/native/Cargo.toml tools/native/src/main.rs
	cargo build --quiet --release --manifest-path tools/native/Cargo.toml

tools/node_modules:
	cd tools && npm ci --silent --no-audit --no-fund
