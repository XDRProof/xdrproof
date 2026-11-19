# XDRProof. Each target re-runs a claim and prints its result.
# Fast and offline:   make verify   make novelty   make coverage   make coverage-report
# Need Docker:        make generate   make conformance   make replay
.PHONY: verify oracle novelty coverage coverage-report coverage-goldens build generate generate-quick order-scan conformance replay replay-729 replay-731 native all

NATIVE := tools/native/target/release/xdrproof-native

verify: tools/node_modules $(NATIVE)  ## schema, hazards, sha256, native rs-stellar-xdr round trip, focus, every fact (seconds)
	node tools/strkey.test.mjs
	node tools/verify.mjs
	node tools/mined-verify.mjs
	node tools/auth-payload-check.mjs

oracle: tools/node_modules             ## facts confirmed by stellar-core's own decoder and the schema walker (needs Docker; seconds)
	node tools/oracle.mjs

novelty: tools/node_modules $(NATIVE) ## leave-one-out: no entry whose every arm, enum, hazard, sighting and placement another entry already holds (seconds)
	node tools/novelty.mjs

coverage:                             ## arms reachable from LedgerCloseMeta vs arms in the corpus bytes and the mined ledgers (seconds)
	tools/coverage/run.sh

coverage-report: tools/node_modules $(NATIVE) ## COVERAGE.md: every arm reached by an entry's own transaction or classified with a core source line; fails if any is neither
	node tools/coverage-report.mjs

build: tools/node_modules $(NATIVE)   ## compile catalog/ into entries/ from the runs of make generate and mined/ (minutes)
	node tools/build.mjs

coverage-goldens:                     ## same, plus stellar-core's own golden ledgers (downloads ~76 MB once)
	GOLDENS=1 tools/coverage/run.sh

generate: tools/node_modules          ## every run twice from a bare stellar-core: both lanes, both passphrases, P30 and P28, three flag profiles (~10 min)
	recipes/regenerate.sh

generate-quick: tools/node_modules    ## mainnet base P30 runs only, twice (~3 min)
	QUICK=1 recipes/regenerate.sh

order-scan: tools/node_modules        ## 20 fresh runs per lane; records which ledgers vary in change order (~15 min)
	recipes/order-scan.sh classic 20
	recipes/order-scan.sh soroban 20 30

conformance:                          ## every corpus variant, strkey, lane S, depth and sighting vectors through JS, WASM, Rust, Go and Python SDKs; must match conformance/expectations/
	conformance/run.sh

replay: replay-729 replay-731         ## every wallet-backend sighting

replay-729:                           ## wallet-backend #729 halted / #716 mishandled / fixed handled (~8 min cold)
	replay/run.sh 729

replay-731:                           ## wallet-backend #731 dropped / fixed handled, on XDRProof's own CAP-0073 entry (~2 min cold)
	replay/run.sh 731

native: $(NATIVE)                     ## build the native rs-stellar-xdr reader (~1 min once)

all: verify oracle coverage generate conformance replay

$(NATIVE): tools/native/Cargo.toml tools/native/src/main.rs
	cargo build --quiet --release --manifest-path tools/native/Cargo.toml

tools/node_modules:
	cd tools && npm ci --silent --no-audit --no-fund
