# XDRProof. Each target re-runs a claim and prints its result.
# Fast and offline:   make verify   make novelty   make coverage   make coverage-report
# Need Docker:        make generate   make conformance   make replay   make lint-selftest   make lint
.PHONY: banner upstream-table verify oracle novelty coverage coverage-report coverage-goldens build generate generate-quick order-scan conformance replay replay-main replay-sightings lint-selftest lint native all

NATIVE := tools/native/target/release/xdrproof-native
# Every target that reports a result prints the same way: a header at once, live rows while it works, proof cards,
# then a verdict (tools/ui.mjs). The one-time setup steps below (installs, the native build) run under a live row
# instead (tools/live-run.mjs): their own output prints above it. Outside a terminal both pass plain text through.
LIVE := node tools/live-run.mjs

verify: tools/node_modules $(NATIVE)  ## schema, hazards, sha256, native round trip, focus, every fact, mined ledgers, strkeys, H-B16 (seconds; DETAILS=1 lists every refused ledger)
	@node tools/verify.mjs $(if $(or $(DETAILS),$(V)),--details)

oracle: tools/node_modules             ## facts confirmed by stellar-core's own decoder and the schema walker (needs Docker; ~20 s, plus a 2 GB download once)
	@node tools/oracle.mjs $(if $(or $(DETAILS),$(V)),--details)

novelty: tools/node_modules $(NATIVE) ## leave-one-out: no entry whose every arm, enum, hazard, sighting and placement another entry already holds (seconds)
	@node tools/novelty.mjs $(if $(or $(DETAILS),$(V)),--details)

coverage:                             ## arms reachable from LedgerCloseMeta vs arms in the corpus bytes and the mined ledgers (seconds)
	@tools/coverage/run.sh $(if $(or $(DETAILS),$(V)),--details)

coverage-report: tools/node_modules $(NATIVE) ## COVERAGE.md: every arm reached by an entry's own transaction or classified with a core source line; fails if any is neither
	@node tools/coverage-report.mjs $(if $(or $(DETAILS),$(V)),--details)

build: tools/node_modules $(NATIVE)   ## compile catalog/ into entries/ from the runs of make generate and mined/ (minutes)
	@node tools/build.mjs $(if $(or $(DETAILS),$(V)),--details)

coverage-goldens:                     ## same, plus stellar-core's own golden ledgers (downloads ~76 MB once)
	@GOLDENS=1 tools/coverage/run.sh $(if $(or $(DETAILS),$(V)),--details)

generate: tools/node_modules          ## every run twice from a bare stellar-core: both lanes, both passphrases, P30 and P28, three flag profiles (~1 min on 10 cores)
	@node recipes/regenerate.mjs $(if $(or $(DETAILS),$(V)),--details)

generate-quick: tools/node_modules    ## mainnet base P30 runs only, twice (~15 s)
	@QUICK=1 node recipes/regenerate.mjs $(if $(or $(DETAILS),$(V)),--details)

order-scan: tools/node_modules        ## 20 fresh runs per lane; records which ledgers vary in change order (~2–5 min)
	@node recipes/order-scan.mjs $(if $(or $(DETAILS),$(V)),--details)

conformance: tools/node_modules $(NATIVE) ## every corpus variant, strkey, lane S, depth and sighting vectors through JS, WASM, Rust, Go and Python SDKs; must match conformance/expectations/ (DETAILS=1 adds bug status and older releases, ARGS="--fresh" ignores the cache, ARGS="--entries <id>,<id>" runs only those entries)
	@conformance/run.sh $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

replay: tools/node_modules $(NATIVE)  ## the whole corpus into wallet-backend main, and every sighting before and after its fix; must match replay/expectations/ (~20 min cold)
	@replay/run.sh all $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

replay-main: tools/node_modules $(NATIVE)  ## every corpus variant into wallet-backend main, one isolated session per ledger
	@replay/run.sh main $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

replay-sightings: tools/node_modules $(NATIVE)  ## #729/#716, #731, #745 and #753 at the commits before and after each fix
	@replay/run.sh sightings $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

lint-selftest:                       ## xplint against its 44 seeded violations and 17 mutants: every one caught, no good case flagged (~2 min warm)
	@node linter/selftest.mjs $(if $(or $(DETAILS),$(V)),--details)

lint: tools/node_modules              ## xplint on wallet-backend, stellar-etl and go-stellar-sdk, the commits around upstream fixes, a patched tree and real-code mutants; must match linter/expectations.json (~15 min cold)
	@node linter/lint.mjs $(if $(or $(DETAILS),$(V)),--details) $(ARGS)

upstream-table:                       ## the "Reported upstream" table in README.md and findings/REPORT.md, from findings/upstream.json with each status asked from GitHub (ORG=<org profile README> writes that too; seconds)
	@node tools/upstream-table.mjs $(if $(ORG),--org $(ORG))

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
