# Tools (/docs/tools)

**What it is.** Every check XDRProof runs, each one a `make` target.

**Why it matters.** Every number on this site comes from one of these commands, and each prints its result on your machine.

| Target | What it proves | Needs | Time |
|---|---|---|---|
| [`make verify`](/docs/tools/verify) | Strkey vectors hold. Every entry matches the schema, sizes and hashes match, and every variant round-trips byte for byte through native rs-stellar-xdr 30.0.0. The focus transaction is present, every fact holds, the WASM reader renders the same JSON wherever it can decode, and the manifest is current. Every mined ledger is verified | Node ≥ 22.15, Rust | seconds |
| [`make oracle`](/docs/tools/oracle) | Each fact's values are also read by stellar-core's own decoder and by the schema walker | Docker, Node ≥ 22.15, npm | seconds |
| [`make coverage`](/docs/tools/coverage) | 499 union arms are reachable from `LedgerCloseMeta` at v30.0; the entries reach 418, the mined ledgers 291 | Python 3, Node ≥ 22.15 | seconds |
| [`make coverage-report`](/docs/tools/coverage#every-arm-accounted-for) | Every one of the 499 arms is reached by an entry's own transaction or ledger shape (418) or classified with the stellar-core source line that decides it (81). Writes `COVERAGE.md` | Node ≥ 22.15, Rust | seconds |
| [`make novelty`](/docs/tools/novelty) | No entry is redundant: leave-one-out over 1,231 atoms (arms, enum members, hazards, sightings, placements) | Node ≥ 22.15, Rust | seconds |
| `make coverage-goldens` | stellar-core's own 866 golden ledger files reach 254 of the 499 | Python 3, git, network | about 1 min |
| [`make generate`](/docs/tools/generate) | 20 fresh standalone cores, in pairs, across both lanes, both passphrases, P30 and P28 and three flag profiles. Every pair agrees, and every shipped generated variant is reproduced | Docker, Node, npm, curl, jq, perl | about 10 min |
| `make generate-quick` | The two mainnet base P30 pairs only | the same | about 3 min |
| [`make order-scan`](/docs/tools/order-scan) | 20 fresh runs per lane: which ledgers vary in change order; content never does | Docker | about 15 min |
| [`make conformance`](/docs/tools/conformance) | Every corpus variant, the strkeys, the invalid-input vectors and a depth ladder go through 6 SDK builds; 5 older releases run the fixed-bug regressions. js-stellar-sdk 17.4.0 and `stellar-xdr` 0.2.1 read every variant exactly as rs-stellar-xdr does; every other difference is pinned with its cause | Node, Rust, Docker | about 2 min warm |
| [`make replay`](/docs/tools/replay) | The whole corpus into wallet-backend `main` (618 of 635 handled, 0 halted), and every fixed failure before and after its fix. Every verdict is pinned | Docker, Node ≥ 22.15, Rust, git | about 20 min cold |
| [`make lint-selftest`](/docs/tools/linter#self-test) | The linter catches all 44 seeded violations and all 17 mutants, and flags none of 31 good cases | Docker | about 2 min warm |
| [`make lint`](/docs/tools/linter) | The linter on real code: wallet-backend `main` (4 findings, all true; 0 with the two patches), stellar-etl (12), go-stellar-sdk ingest (0), the commits around upstream fixes and fixed bugs put back. Every finding is pinned and triaged | Docker, Node ≥ 22.15, git | about 3 min warm |

`make all` runs verify, oracle, coverage, generate, conformance, replay, lint-selftest and lint.

`make build` is not a check: it compiles `catalog/` into `entries/` from the runs of `make generate` and `mined/`, in minutes. See [Catalog](/docs/corpus/catalog).

## The readers behind them

| Reader | What it is | Used by |
|---|---|---|
| Native reader | A small Rust program on `stellar-xdr` 30.0.0 (depth limit 1500) that decodes, renders SEP-0051 JSON and re-encodes | verify, novelty, coverage-report, conformance (the reference), replay |
| WASM reader | `@stellar/stellar-xdr-json` 30.0.0, a second opinion | verify, conformance |
| `stellar-core` | Core's own C++ `dump-xdr`, in Docker with no network, on the pinned image | oracle |
| Schema walker | `walker.mjs`: XDRProof's own JavaScript reader, driven only by the XDR definitions; it shares no code with any SDK | oracle |
| Coverage walker | `xdrcov.py`: a Python walker over the same v30.0 definitions that records every union arm and enum member it meets | coverage |
| xplint | Go analyzers over SSA (`golang.org/x/tools`), built and run in a pinned Go image | lint, lint-selftest |
| Segment walker | the schema walker again, attributing every arm it meets to the transaction envelope or result meta it sits in, or to the ledger itself | coverage-report, novelty |
