# XDRProof. Each target re-runs a claim and prints its result.
# Fast and offline:   make verify   make novelty   make coverage   make coverage-report
# Need Docker:        make generate   make conformance   make replay   make lint-selftest   make lint
.PHONY: banner verify oracle novelty coverage coverage-report coverage-goldens build generate generate-quick order-scan conformance replay replay-main replay-sightings lint-selftest lint native all

NATIVE := tools/native/target/release/xdrproof-native
# Targets not yet drawn as proof cards run under a live row (tools/live-run.mjs): their output prints above it, so
# the terminal is never blank while they work. Outside a terminal it passes everything through unchanged.
LIVE := node tools/live-run.mjs

verify: tools/node_modules $(NATIVE)  ## schema, hazards, sha256, native round trip, focus, every fact, mined ledgers, strkeys, H-B16 (seconds; DETAILS=1 lists every refused ledger)
	@node tools/verify.mjs $(if $(or $(DETAILS),$(V)),--details)

oracle: tools/node_modules             ## facts confirmed by stellar-core's own decoder and the schema walker (needs Docker; seconds)
	@$(LIVE) "Checking facts with stellar-core's decoder" -- node tools/oracle.mjs

novelty: tools/node_modules $(NATIVE) ## leave-one-out: no entry whose every arm, enum, hazard, sighting and placement another entry already holds (seconds)
	@$(LIVE) "Checking every entry adds something new" -- node tools/novelty.mjs

coverage:                             ## arms reachable from LedgerCloseMeta vs arms in the corpus bytes and the mined ledgers (seconds)
	@tools/coverage/run.sh $(if $(or $(DETAILS),$(V)),--details)

coverage-report: tools/node_modules $(NATIVE) ## COVERAGE.md: every arm reached by an entry's own transaction or classified with a core source line; fails if any is neither
	@$(LIVE) "Writing COVERAGE.md" -- node tools/coverage-report.mjs

build: tools/node_modules $(NATIVE)   ## compile catalog/ into entries/ from the runs of make generate and mined/ (minutes)
	@$(LIVE) "Compiling the catalog into entries" -- node tools/build.mjs

coverage-goldens:                     ## same, plus stellar-core's own golden ledgers (downloads ~76 MB once)
	@GOLDENS=1 tools/coverage/run.sh $(if $(or $(DETAILS),$(V)),--details)

generate: tools/node_modules          ## every run twice from a bare stellar-core: both lanes, both passphrases, P30 and P28, three flag profiles (~10 min)
	@$(LIVE) "Generating ledgers with stellar-core" -- recipes/regenerate.sh

generate-quick: tools/node_modules    ## mainnet base P30 runs only, twice (~3 min)
	@QUICK=1 $(LIVE) "Generating mainnet P30 ledgers" -- recipes/regenerate.sh

order-scan: tools/node_modules        ## 20 fresh runs per lane; records which ledgers vary in change order (~15 min)
	@$(LIVE) "Scanning change order: classic" -- recipes/order-scan.sh classic 20
	@$(LIVE) "Scanning change order: soroban" -- recipes/order-scan.sh soroban 20 30

conformance:                          ## every corpus variant, strkey, lane S, depth and sighting vectors through JS, WASM, Rust, Go and Python SDKs; must match conformance/expectations/ (DETAILS=1 adds bug status and older releases, ARGS="--fresh" ignores the cache)
	@conformance/run.sh $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

replay: tools/node_modules $(NATIVE)  ## the whole corpus into wallet-backend main, and every sighting before and after its fix; must match replay/expectations/ (~20 min cold)
	@replay/run.sh all $(if $(or $(DETAILS),$(V)),--details)

replay-main: tools/node_modules $(NATIVE)  ## every corpus variant into wallet-backend main, one isolated session per ledger
	@replay/run.sh main $(if $(or $(DETAILS),$(V)),--details)

replay-sightings: tools/node_modules $(NATIVE)  ## #729/#716, #731, #745 and #753 at the commits before and after each fix
	@replay/run.sh sightings $(if $(or $(DETAILS),$(V)),--details)

lint-selftest:                       ## xplint against its 44 seeded violations and 17 mutants: every one caught, no good case flagged (~2 min warm)
	@node linter/selftest.mjs $(if $(or $(DETAILS),$(V)),--details)

lint: tools/node_modules              ## xplint on wallet-backend, stellar-etl and go-stellar-sdk, the commits around upstream fixes, a patched tree and real-code mutants; must match linter/expectations.json (~15 min cold)
	@node linter/lint.mjs $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

native: $(NATIVE)                     ## build the native rs-stellar-xdr reader (~1 min once)

banner: tools/cast/node_modules        ## the README banner, .github/assets/banner.svg (the org profile uses the same file), from the recorded run in tools/cast/recordings (RECORD=1 records make verify again first)
	@$(if $(RECORD),python3 -I tools/cast/record.py tools/cast/recordings/verify-60.cast --cols 60 --rows 40 --title "make verify" -- make verify &&) node tools/cast/banner.mjs

all: verify oracle coverage generate conformance replay lint-selftest lint

$(NATIVE): tools/native/Cargo.toml tools/native/src/main.rs
	@$(LIVE) "Building the native reader (once)" -- cargo build --quiet --release --manifest-path tools/native/Cargo.toml

tools/cast/node_modules: tools/cast/package-lock.json
	@$(LIVE) "Installing the recording tools (once)" -- sh -c 'cd tools/cast && npm ci --silent --no-audit --no-fund --ignore-scripts'

tools/node_modules:
	@$(LIVE) "Installing the tools' dependencies (once)" -- sh -c 'cd tools && npm ci --silent --no-audit --no-fund'
