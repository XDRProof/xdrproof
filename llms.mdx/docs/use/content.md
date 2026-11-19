# Use it on your code (/docs/use)

**What it is.** The rest of these docs show how XDRProof tests other people's code. This section is for your team: the shortest way to point XDRProof at your own SDK, your own Go indexer and your own indexer.

**Why it matters.** The corpus holds the rare ledgers that broke real indexers and SDKs. Running it in your own CI means your code meets them before your users do, and keeps meeting them on every change.
- [Test your SDK](https://xdrproof.dev/docs/use/sdk): A copy-paste test in JavaScript, Go, Rust or Python: every corpus ledger must decode and re-encode to the same bytes.
- [Lint your Go indexer](https://xdrproof.dev/docs/use/lint): Run xplint on your repository for the three ingestion mistakes, with SARIF for GitHub code scanning.
- [Replay your indexer](https://xdrproof.dev/docs/use/replay): Write a small adapter and replay every corpus ledger into your indexer, with a verdict for each from what it stored.

Every snippet in this section was run in an empty folder, against a fresh clone of the repository, on 19 November 2026. The output shown is what it printed. Where something did not work as first written, the page says so.
