# What XDRProof is (/docs/start)

**What it is.** A free, open test kit for any program that reads the Stellar ledger: indexers, wallets, explorers and SDKs. It holds real ledger data in its rarest valid shapes, the answers a correct program must give, and tools that check your code against them.

**Why it matters.** Most ledgers are ordinary, so the rare shapes go untested until one arrives in production, where it can stop an indexer or store a wrong balance. XDRProof lets every team meet them in a test first.

An indexer has run fine for months. Then a ledger arrives with a shape its code has never seen:

- a signer that carries a payload;
- a trustline created by a contract call, with no event;
- a map whose keys all read as "1".

Ingestion halts, or worse, it keeps going and stores something wrong. The team fixes it. Next month another team, in another language, meets the same shape.

**XDRProof turns each of those shapes into a test everyone can run.** One team's incident becomes every team's regression test, and one SDK's fix becomes a check on all of them.

Figure: the 44-byte signed-payload SignerKey from testnet ledger 4437357: type 3, a 32-byte ed25519 key, length 3, payload `de ad be`, and one byte of padding.

## One ledger, start to finish

Figure (animated): one ledger, start to finish. A recipe drives a private stellar-core, which closes a ledger; the ledger becomes a corpus entry (its exact bytes plus the answers a correct reader must find); three independent checks confirm the answers; then the same ledger is replayed into an indexer and read by every SDK build.

## What is in it

| Part | What it is | Where |
|---|---|---|
| **Corpus** | 264 entries of real `LedgerCloseMeta` bytes, each tagged with its CAP, with the facts a correct reader must return | [`entries/`](/docs/corpus) |
| **Hazard registry** | 78 named ways readers break, in 8 layers, each with its evidence | [`caps/registry.json`](/docs/hazards) |
| **Schema and manifest** | JSON Schema 2020-12 for an entry; a generated index of every variant | [`schema/v1`](/docs/corpus/schema) |
| **Mined ledgers** | 38 real mainnet and testnet ledgers from the public data lake, for shapes only a real network produces, or worth having as real network bytes | [`mined/`](/docs/corpus/mined) |
| **Recipes** | Transactions for a bare standalone stellar-core that regenerate every generated variant | [`recipes/`](/docs/corpus/recipes) |
| **Tools** | Verify, oracle, coverage, generate, order scan, conformance and replay, each a `make` target | [`tools/`](/docs/tools) |
| **Linter** | `xplint`, which points at the lines of Go indexer code that make the three ingestion mistakes: 4 real findings on wallet-backend `main`, 0 with XDRProof's two patches | [`linter/`](/docs/tools/linter) |

## Check every claim yourself

The numbers on these pages come from the repository's own data or from a `make` target you can run, and each page names which. Start with [Quickstart](/docs/start/quickstart).

## What it has found

Its runs found two bugs nobody had reported. Both are filed upstream with a figure and a reproduction: [wallet-backend#834](https://github.com/stellar/wallet-backend/issues/834) and [js-stellar-xdr-json#67](https://github.com/stellar/js-stellar-xdr-json/issues/67). For an issue that was already open, [wallet-backend#820](https://github.com/stellar/wallet-backend/issues/820#issuecomment-7009772300), XDRProof offered a tested fix. See [Reported upstream](/docs/findings/reported).

<Callout type="warn" title="Not built yet">
The RFP also asks for an **indexer-hardening guide**, and XDRProof will ship as a **GitHub Action** and packages for JavaScript, Go and Rust. These are what the grant funds; see [Architecture](/docs/start/architecture). The registry already marks the hazards the guide will cover.
</Callout>

<Callout title="Early, built in public">
This repository backs a proposal to the Stellar Community Fund's RFP *XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide* (SCF #46). The corpus grows entry by entry from here. XDRProof is an independent open-source project, not affiliated with or endorsed by the Stellar Development Foundation.
</Callout>
