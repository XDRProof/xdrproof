# Architecture (/docs/start/architecture)

**What it is.** A map of XDRProof: the corpus in the middle, the checks that prove it, and three tools that run it against real code: replay for indexers, conformance for SDKs, and a linter for indexer source.

**Why it matters.** Everything marked built here exists in the repository today and re-runs with one command, so you can check it instead of trusting it. What the grant would fund is listed separately.

![XDRProof pipeline: make the shapes, prove them, run them against code](https://xdrproof.dev/brand/pipeline-light.png)

## Built today, and what the grant funds

| Part | State | Re-run it |
|---|---|---|
| Manifest schema (JSON Schema 2020-12) with every field the RFP names | built | `make verify` |
| Hazard registry: 78 named ways readers of the ledger break, in 8 layers | built | [`caps/registry.json`](/docs/hazards) |
| Corpus: 264 entries, 635 variants, from a pinned stellar-core v30.0.0 and SDF's public data lake | built | `make verify`, `make generate` |
| Independent readers: stellar-core's own decoder and a schema walker find 741 expected values in their ledgers; `make verify` checks each at its exact field | built | `make oracle` |
| Coverage: 418 of 499 union arms reached; the other 81 each classified with a stellar-core source line | built | `make coverage-report` |
| SDK conformance runner: 6 SDK builds on the corpus and test vectors, 5 older releases on fixed-bug regressions | built | `make conformance` |
| Indexer replay harness, with a wallet-backend adapter | built | `make replay` |
| `xplint`, a Go linter for the three ingestion mistakes the RFP names | built | `make lint-selftest`, `make lint` |
| Findings reported upstream | reported | [Reported upstream](/docs/findings/reported) |

Everything above is pre-award work. The $60,000 award funds 120 engineer-days through the v1.0 release:

- the indexer-hardening guide, reviewed by a stellar-core or platform engineer;
- per-CAP and golden-agreement reports, and a memory gate on replay;
- packages for JavaScript, Go and Rust, CI workflows and a GitHub Action;
- two more indexer adapters (stellar-etl and Horizon), and runners for five more SDKs (Java, Swift, Flutter/Dart, PHP and .NET);
- this documentation site.

After v1.0, XDRProof is maintained for 18 months, outside the award budget.

## The RFP's deliverables, mapped

| The RFP asks for | XDRProof |
|---|---|
| A corpus of real and synthetic XDR shapes, each tagged with its CAP and protocol | [`entries/`](/docs/corpus) and `manifest.json`; each variant records its protocol, its source and whether it is synthetic |
| Expected decoded values for each entry | each entry's facts, every one backed by construction, a snapshot, stellar-core, the walker or review; none rests on one decoder alone |
| A coverage report per CAP and per arm | [`COVERAGE.md`](/docs/tools/coverage) per arm and per hazard today; per CAP is funded |
| Agreement with stellar-core's golden files | `make coverage-goldens` compares arm coverage today; a comparison of decoded field paths and values at a pinned core revision is funded |
| A replay harness for indexers, with bounded memory | [`replay/`](/docs/tools/replay) with a documented adapter contract; a memory gate in CI is funded |
| A linter for the three ingestion mistakes, clean on current wallet-backend | [`linter/`](/docs/tools/linter) catches all three. On unmodified wallet-backend `main` it reports 4 findings, all true, and 0 with XDRProof's two tested patches, offered upstream. Until an unmodified current revision runs clean, this check stays open |
| An indexer-hardening guide, reviewed by a core or platform engineer | funded, published only after that review |
| Findings filed upstream | [Reported upstream](/docs/findings/reported) |

## Where the ledgers come from

- **Made on a bare stellar-core.** [Recipes](/docs/corpus/recipes) drive a standalone stellar-core v30.0.0, pinned by image digest, with no peers, test-only keys committed in the recipes and no real funds. `make generate` rebuilds every run twice from scratch and checks that each pair agrees. 226 entries come from here.
- **Order is measured, not assumed.** stellar-core writes some changes in an order that varies between runs. `make order-scan` runs each recipe lane 20 times and records which ledgers vary; the corpus ships the rarer orderings as bytes, so a reader that depends on order fails.
- **Mined from the real networks.** [`mined/`](/docs/corpus/mined) keeps 38 mainnet and testnet ledgers from the public data lake, with their URLs and hashes, for shapes that are cheaper to find than to make. 37 entries come only from mined ledgers; 1 from both.

## Where "correct" comes from

Expected values never come from the SDK under test.

- `make verify` round-trips every variant, byte for byte, through native rs-stellar-xdr 30.0.0 and checks every fact.
- `make oracle` looks for each checkable value with two readers that share no code with any SDK, stellar-core's own C++ decoder and XDRProof's schema walker, and fails if either does not find it.
- `make novelty` checks that no entry is redundant: over 1,231 atoms, 181 entries hold something no other entry does, and the other 83 differ by where the hazard sits.

## Three tools that run it against real code

### Replay, for indexers

Figure: how a replay works. A corpus ledger is served by a mock stellar-rpc to a real indexer build with its own database; what it did (its cursor, its process, the rows it stored) is compared with probes derived from the same ledger, which gives a verdict: handled, dropped, mishandled, stalled, crashed or halted.

Each corpus ledger is served to a real indexer build through a mock stellar-rpc, in a fresh session with its own database. The verdict comes from what the indexer stored, never from its logs. An indexer joins with a small `adapter.toml` and a few shell commands; wallet-backend is the reference. On `main`, 618 of 635 variants are handled and 0 halt. [Replay](/docs/tools/replay)

### Conformance, for SDKs

Figure: how conformance works. The same bytes (every corpus variant, strkeys, invalid input and a depth ladder) go through each SDK build; every answer is compared with native rs-stellar-xdr (the bytes, SEP-0051 JSON, every expected fact), and the matrix marks each result pass or known (pinned with its cause).

Each SDK build is wrapped in a small program that speaks one line-delimited JSON protocol, so a new language needs one small program. Every known difference is pinned with its cause, so a new failure and a fix upstream both fail the run until the expectation is updated. [Conformance](/docs/tools/conformance)

### The linter, for indexer source

Figure: how xplint decides. A value from ScAddress.String(), which may be a muxed, contract, pool or balance address, reaches a map key that outlives the function with no check on the way: XP001/muxed-as-account. Through a switch on the address kind first, only an account reaches the sink, and nothing is reported.

`xplint` is a set of Go analyzers, one per mistake the RFP names. It writes text, JSON and SARIF for GitHub code scanning, and it fires before each upstream fix of these mistakes and goes quiet after. [Linter](/docs/tools/linter)

## Findings and disclosure

Ordinary bugs are written up and reported upstream after a duplicate search, each with a figure, a reproduction and, where possible, a tested fix. Halts and crashes anyone can trigger are reported privately first, through SDF's security channel, and are not published until a fix ships or 90 days pass.

## Distribution and CI

- **npm:** `xdrproof`, the command-line tool, and `@xdrproof/corpus`, the corpus with a loader and test helpers for Vitest and Jest.
- **Go** and **Rust:** the corpus as a Go module with a table-test helper, and a Rust loader crate.
- **Workflows** with actions pinned by SHA and a read-only token by default. `check` already runs `make verify`, `make novelty` and the linter self-test on every push and pull request; the grant adds the oracle and coverage gate to it, then conformance, replay (with the memory gate), determinism, golden agreement, an upstream watch that opens a pull request when stellar-xdr, stellar-core or an SDK tags a release, and release with checksums and provenance.
- **A GitHub Action**, `XDRProof/action`, that runs the checks on a pinned corpus in another team's CI and uploads SARIF.

## Protocol upgrades

stellar-xdr's definitions are the input. A new union arm shows up as unclassified coverage and fails `make coverage-report` until an entry or an exclusion covers it (a CI gate from Tranche 2); enum members and CAPs are counted but not yet gated. The upstream watch turns each release into a pull request with the coverage change. After v1.0, XDRProof is maintained for 18 months: new protocol shapes, issue triage, and a release for each protocol upgrade.

## Independence

The corpus, schema, tools and adapter contract are Apache-2.0 and run from a clone, with no XDRProof service in the path, so anyone can keep using them whatever happens to the maintainer. GitHub hosts the source, CI and releases; this site is generated from the repository. The tools collect no analytics. Milestone status is posted publicly in [`STATUS.md`](https://github.com/XDRProof/xdrproof/blob/main/STATUS.md) and weekly in #scf-general on the Stellar developer Discord.

## Security

The generator runs a standalone stellar-core (no peers) in Docker, with test-only keys committed in the recipes and no real funds or production credentials; its HTTP port is published on the host while it runs. The repository needs no secrets. Every generated ledger is reproducible from its recipe. The replay harness runs each indexer in a container with a memory limit; an indexer that is killed ends its session and is judged from its process and cursor. Halts and crashes anyone can trigger are reported privately first. The threat model, what is in place and what is still open, is on [Security](/docs/start/security).

## Technology

| Part | Choice | Why |
|---|---|---|
| Ledgers | stellar-core v30.0.0 (Docker, pinned digest), SDF's public data lake | the bytes the network writes |
| Reference decoding | rs-stellar-xdr 30.0.0 (native), stellar-core `dump-xdr` | independent of every SDK under test |
| Tooling | Node.js, Rust | the corpus tools and the native reader |
| Linter | Go, `golang.org/x/tools` | the language of wallet-backend, stellar-etl and the SDK's ingest code |
| Replay | Docker, TimescaleDB (wallet-backend's own pinned image) | each indexer in its real environment |
| Licence | Apache-2.0 | |

The same document, with more detail, is [`ARCHITECTURE.md`](https://github.com/XDRProof/xdrproof/blob/main/ARCHITECTURE.md) in the repository.
