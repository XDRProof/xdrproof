# XDRProof

**Proof that your code reads the Stellar ledger right.**

XDRProof is a shared library of rare but valid Stellar ledger data, plus the tools to run it through any indexer or SDK and report exactly what breaks.

> Status: early development. This repository is being built in the open as part of a proposal to the Stellar Community Fund's RFP **"XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide"** (SCF #46, RFP Track). Nothing here is production-ready yet.

## The problem

Every wallet, explorer and data pipeline on Stellar decodes the ledger's XDR and then stores what it read. Each protocol upgrade adds rare transaction shapes (signed-payload signers, muxed accounts, contract-created trustlines, deep authorization trees) that most code never sees in testing. When one appears on the live network, readers halt, drop data or store it wrong, and each team finds the same bug on its own.

## What XDRProof will provide

| Part | What it does |
| --- | --- |
| **Corpus** | Ledger and transaction entries emitted by stellar-core, one per rare shape, each tagged with the CAP and protocol that introduced it and the values a correct decoder must return. |
| **Replay harness** | Feeds the corpus to an indexer as if it were the live network and reports, per entry: handled, mishandled or silently dropped. |
| **Conformance runner** | Runs the same entries through the JavaScript, Go and Rust SDKs and flags every disagreement with the network or between SDKs. |
| **Linter** | Flags three ingestion mistakes in indexer code: trusting fields stellar-core doesn't validate, recursing without depth or size limits, and reading participants from the envelope instead of the meta. |
| **Guide** | An indexer-hardening guide: which fields are safe to trust, recommended limits, and how to handle muxed and signed-payload addresses. |

## Links

- Website: https://xdrproof.github.io
- The RFP: https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track

## Independence

XDRProof is an independent open-source project. It is not affiliated with or endorsed by the Stellar Development Foundation.

All code will be released under a permissive open-source licence.
