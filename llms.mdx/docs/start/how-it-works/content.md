# How it works (/docs/start/how-it-works)

**What it is.** The whole pipeline in four steps: make rare ledgers, write down what a correct reader must find, check that with independent readers, then run real indexers, SDKs and indexer code against it.

**Why it matters.** Each step is one `make` command, so any claim on this site can be re-checked.

Figure (animated): one ledger, start to finish. A recipe drives a private stellar-core, which closes a ledger; the ledger becomes a corpus entry (its exact bytes plus the answers a correct reader must find); three independent checks confirm the answers; then the same ledger is replayed into an indexer and read by every SDK build.

The full map, with every tool and its numbers:

![XDRProof pipeline: make the shapes, prove them, run them against code](https://xdrproof.dev/brand/pipeline-light.png)

## 1. Make the shapes

A **[recipe](/docs/corpus/recipes)** is a deterministic script that drives one fresh standalone stellar-core v30.0.0 over its HTTP port. The core image is pinned by digest. There is no RPC and no network (no peers); the keys are test-only, from fixed seeds, there are no real funds, and close times are fixed. Core writes every closed ledger as `LedgerCloseMeta`.

Some shapes only happen on a real network, or are worth having as real network bytes, so they are **mined** from public ledger history instead. [`mined/`](/docs/corpus/mined) holds 37 real mainnet and testnet ledgers; 37 entries are built from 22 of them, the testnet ledger where wallet-backend halted among them.

## 2. Keep the bytes, write down the truth

Each interesting ledger becomes a corpus **entry**, compiled from a hand-written [catalog file](/docs/corpus/catalog). An entry holds:
- the raw bytes;
- the CAP and the hazard it targets;
- where in the XDR the hazard sits;
- the **facts** a correct reader must find, each with what backs it.

## 3. Check the truth independently

| Check | Reader | Target |
|---|---|---|
| Byte-for-byte round trip, every fact | native rs-stellar-xdr 30.0.0; the WASM build must agree wherever it can decode | `make verify` |
| Fact values also read by | stellar-core's own `dump-xdr` (C++) and XDRProof's schema walker | `make oracle` |
| Which union arms are reached | a Python walker over the v30.0 XDR definitions | `make coverage` |
| Every arm reached by an entry, or classified with the core source line that decides it | the schema walker, per transaction | `make coverage-report` |
| No entry is redundant | leave-one-out over each entry's arms, hazards, sightings and placements | `make novelty` |

## 4. Run it against real code

| Against | How | Target |
|---|---|---|
| The SDKs | 6 builds of the JavaScript, WASM, Rust, Go and Python SDKs read every corpus variant, plus strkey, invalid-input and depth vectors; 5 older releases run the fixed-bug regressions | `make conformance` |
| An indexer | real wallet-backend builds ingest every corpus ledger, one isolated session each, through a mock stellar-rpc | `make replay` |
| Indexer source code | `xplint` follows each value from where it came from to where it is kept, for the three ingestion mistakes | `make lint` |

<Callout type="warn" title="Planned, not built">
The figure marks two pieces as planned: a GitHub Action and the hardening guide. Today every check runs as a `make` target. [Architecture](/docs/start/architecture) says what is built and what the grant funds.
</Callout>
