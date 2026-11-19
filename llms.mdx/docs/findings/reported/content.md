# Reported upstream (/docs/findings/reported)

**What it is.** Two bugs XDRProof found in other projects' code that nobody had reported, filed upstream, and a tested fix offered on a third that was already open.

**Why it matters.** A test kit earns trust by what it catches. Each report below comes with a figure, a reproduction anyone can run, and, where we could, a tested fix. Filing is done the way the projects ask: a duplicate search first, one issue per bug.

## F-3: balances stored short on protocol 20–22 ledgers

Reported: [stellar/wallet-backend#834](https://github.com/stellar/wallet-backend/issues/834) · fix: [fix/pre-p23-soroban-refund-balances](https://github.com/Blockchain-Oracle/wallet-backend/compare/main...fix/pre-p23-soroban-refund-balances)

![Before protocol 23, each Soroban fee refund sits inside its own transaction's changes, which wallet-backend does not read; from protocol 23 all refunds come in one block it does read. On pubnet ledger 56085459, 7 of 7 refunded accounts are stored short.](https://xdrproof.dev/findings/f3-refunds.png)

![A terminal: the replay harness runs the protocol 22 ledger into wallet-backend main and reports it mishandled; a jq query lists the seven accounts, each stored short by its refund.](https://xdrproof.dev/findings/f3-repro.gif)

Before protocol 23, stellar-core credits a Soroban fee refund inside the transaction's own changes. wallet-backend builds native balances from fees, operations and the newer, separate refund block only, so every refunded account on such a ledger is stored short by exactly its refund, while wallet-backend's own balance history adds up.

It bites when an indexer works through older ledgers, such as a catch-up from the data lake. The fix is on a branch; the whole corpus replayed into it handles both variants of that ledger and changes no other verdict.


## F-1: a decoder refuses a ledger stellar-core closed

Reported: [stellar/js-stellar-xdr-json#67](https://github.com/stellar/js-stellar-xdr-json/issues/67)

![Bars for one transaction with a 245-deep authorization tree: the authorization entry needs depth 499, which fits the limit of 500; the transaction needs 507 and the ledger 519, both refused.](https://xdrproof.dev/findings/f1-depth.png)

![A terminal: a corpus ledger is downloaded and decoded with @stellar/stellar-xdr-json 30.0.0, which fails with depth limit exceeded.](https://xdrproof.dev/findings/f1-repro.gif)

`@stellar/stellar-xdr-json` 30.0.0, the WebAssembly build of rs-stellar-xdr, limits nesting to 500 levels for the whole value it decodes. stellar-core allows 500 per authorization entry, and the layers around a transaction add more, so the deepest trees core applies cannot be decoded once they are inside a transaction or a ledger. The corpus made them on a standalone stellar-core v30.0.0 with Soroban's resource limits raised for testing (`TESTING_SOROBAN_HIGH_LIMIT_OVERRIDE`), which the entry records.

It refuses 13 corpus variants that stellar-core wrote. Every other decoder tested reads them; see [Conformance](/docs/tools/conformance).


Figure (animated): how deep is too deep. Counted from the authorization entry, as stellar-core counts, the deepest tree it applies needs depth 499, under the limit of 500. Counted from the transaction it needs 507, and from the ledger 519; @stellar/stellar-xdr-json counts from the ledger and refuses it.

## wallet-backend#820: an authorization walk with no limit

Reported: [fix offered · wallet-backend#820](https://github.com/stellar/wallet-backend/issues/820#issuecomment-7009772300)

![A 245-deep chain of invocations with a bound drawn at depth 256. A limit that returns an error halts ingestion on every retry; the proposed limit stops descending, counts and logs, and the ledger ingests.](https://xdrproof.dev/findings/820-bounded-walk.png)

wallet-backend walks the authorization tree a transaction declares with no depth or node limit (issue #820, filed by another team). [The linter](/docs/tools/linter) finds it as `XP002/walk-unbudgeted`.

The fix offered bounds the walk well above anything the network applies today, and stops at the limit instead of failing. Our first version failed at depth 64, which would have halted ingestion on the 245-deep ledgers in the corpus; that mistake is now a linter rule of its own, `XP002/budget-fails`.


## Found, not filed

| ID | What | Why not filed |
|---|---|---|
| F-2 | The Python SDK, `stellar-sdk` 17.0.1, raises on a muxed contract address (CAP-0084) when rendering JSON. | Already fixed on its main branch by the switch to `stellar-xdr`; `stellar-xdr` 0.2.1 passes. |
| F-4 | wallet-backend's Blend decoder uses an arbitrary `ScAddress` value as an account (found by `XP001/muxed-as-account`). | Not reachable today, and the Stellar contribution guide asks not to file speculative findings. The fix is ready. |

Bugs that would let anyone halt or crash an indexer are reported privately first, through SDF's security channel, and are not published here until a fix ships or 90 days pass ([`findings/policy.md`](https://github.com/XDRProof/xdrproof/blob/main/findings/policy.md)). The full triage is [`findings/REPORT.md`](https://github.com/XDRProof/xdrproof/blob/main/findings/REPORT.md).
