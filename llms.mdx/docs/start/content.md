# What XDRProof is (/docs/start)

An indexer has run fine for months. Then a ledger arrives with a shape its code has never seen:

- a signer that carries a payload;
- a trustline created by a contract call, with no event;
- a map whose keys all read as "1".

Ingestion halts, or worse, it keeps going and stores something wrong. The team fixes it. Next month another team, in another language, meets the same shape.

**XDRProof turns each of those shapes into a test everyone can run.** One team's incident becomes every team's regression test, and one SDK's fix becomes a check on all of them.

Figure: the 44-byte signed-payload SignerKey from testnet ledger 4437357: type 3, a 32-byte ed25519 key, length 3, payload `de ad be`, and one byte of padding.

## What is in it

| Part | What it is | Where |
|---|---|---|
| **Corpus** | 263 entries of real `LedgerCloseMeta` bytes, each tagged with its CAP, with the facts a correct reader must return | [`entries/`](/docs/corpus) |
| **Hazard registry** | 78 named ways readers break, in 8 layers, each with its evidence | [`caps/registry.json`](/docs/hazards) |
| **Schema and manifest** | JSON Schema 2020-12 for an entry; a generated index of every variant | [`schema/v1`](/docs/corpus/schema) |
| **Mined ledgers** | 37 real mainnet and testnet ledgers from the public data lake, for shapes only a real network produces, or worth having as real network bytes | [`mined/`](/docs/corpus/mined) |
| **Recipes** | Transactions for a bare standalone stellar-core that regenerate every generated variant | [`recipes/`](/docs/corpus/recipes) |
| **Tools** | Verify, oracle, coverage, generate, order scan, conformance and replay, each a `make` target | [`tools/`](/docs/tools) |

## Check every claim yourself

The numbers on these pages come from the repository's own data or from a `make` target you can run, and each page names which. Start with [Quickstart](/docs/start/quickstart).

<Callout type="warn" title="Not built yet">
The RFP also asks for an indexer **linter** and an **indexer-hardening guide**, and XDRProof will ship as a **GitHub Action** and packages. None of these exist in the repository yet. The registry already marks the hazards the linter and the guide will cover.
</Callout>

<Callout title="Early, built in public">
This repository backs a proposal to the Stellar Community Fund's RFP *XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide* (SCF #46). The corpus grows entry by entry from here. XDRProof is an independent open-source project, not affiliated with or endorsed by the Stellar Development Foundation.
</Callout>
