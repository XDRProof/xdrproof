# Replay (/docs/tools/replay)

**What it is.** Every corpus ledger fed to a real indexer, one at a time, through a mock of the RPC an indexer reads ledgers from, then a look at what the indexer stored.

**Why it matters.** An indexer that halts stops a wallet's history; one that stores a wrong balance is worse. Replay shows which ledgers do that before mainnet does.

```bash
make replay              # the whole corpus into wallet-backend main, then every sighting
make replay-main         # the corpus only
make replay-sightings    # #729/#716, #731, #745 and #753, before and after their fixes
node replay/harness.mjs --adapter wallet-backend --target main --entries muxed.payment.every-position
```

Needs Docker, Node ≥ 22.15 and the native reader (`make native`). Once the images and Go modules are cached nothing reaches the network: the ledgers come from the corpus. On a laptop under Docker, six sessions at a time, the full run takes about 9.5 minutes once the builds are cached.

Figure: how a replay works. A corpus ledger is served by a mock stellar-rpc to a real indexer build with its own database; what it did (its cursor, its process, the rows it stored) is compared with probes derived from the same ledger, which gives a verdict: handled, dropped, mishandled, stalled, crashed or halted.

![A terminal: the replay harness runs one protocol 22 ledger into wallet-backend main; three control ledgers are handled and the target is mishandled; a jq query over the harness's report lists the seven accounts stored short by their refunds.](https://xdrproof.dev/findings/f3-repro.gif)

## wallet-backend main, the whole corpus

The reference indexer is [stellar/wallet-backend](https://github.com/stellar/wallet-backend). At `main` (<code>18db88f4</code>) it ingests 634 variants in 364 sessions: **618 handled, 0 halted**. The other 16 are each pinned with their cause in `replay/expectations/wallet-backend@main.json`:

| Entry | Variants | Verdict | Why | Upstream |
|---|---|---|---|---|
| [`backfill.p22-refunds-in-tx-changes-after`](https://xdrproof.dev/docs/corpus/entries/backfill-p22-refunds-in-tx-changes-after) | 1 | mishandled | F-3. Before protocol 23 a Soroban fee refund is credited in txChangesAfter; wallet-backend's native balances read fee changes, operation changes and post-apply refunds (protocol 23+) only, so the 7 refunded accounts of pubnet ledger 56085459 end short by exactly their refund, while its own BALANCE history rows add up to the ledger. | [wallet-backend#834](https://github.com/stellar/wallet-backend/issues/834) |
| [`contract.sac-deploy-from-asset`](https://xdrproof.dev/docs/corpus/entries/contract-sac-deploy-from-asset) | 4 | dropped | A Stellar Asset Contract deploy declares no auth entry, and wallet-backend records contract creations only from auth entries and the operation's own FromAddress preimage. | [wallet-backend#815](https://github.com/stellar/wallet-backend/issues/815) |
| [`failure.manage-buy-offer.buy-not-authorized-p22`](https://xdrproof.dev/docs/corpus/entries/failure-manage-buy-offer-buy-not-authorized-p22) | 1 | mishandled | F-3. Before protocol 23 a Soroban fee refund is credited in txChangesAfter; wallet-backend's native balances read fee changes, operation changes and post-apply refunds (protocol 23+) only, so the 7 refunded accounts of pubnet ledger 56085459 end short by exactly their refund, while its own BALANCE history rows add up to the ledger. | [wallet-backend#834](https://github.com/stellar/wallet-backend/issues/834) |
| [`preauth.failing-tx-still-removes-signer`](https://xdrproof.dev/docs/corpus/entries/preauth-failing-tx-still-removes-signer) | 2 | dropped | Core removes a used pre-auth signer in txChangesBefore even when the transaction fails (CAP-0028); wallet-backend reads signer changes from operation effects only. | [wallet-backend#805](https://github.com/stellar/wallet-backend/issues/805), [wallet-backend#818](https://github.com/stellar/wallet-backend/issues/818) |
| [`revoke.cascade-offers-pool-shares`](https://xdrproof.dev/docs/corpus/entries/revoke-cascade-offers-pool-shares) | 2 | dropped | Revoking authorization redeems the holder's pool shares and deletes the pool-share trustline (CAP-0038); wallet-backend writes TRUSTLINE REMOVE only from ChangeTrust. | [wallet-backend#817](https://github.com/stellar/wallet-backend/issues/817) |
| [`sac.xlm-transfer-creates-account`](https://xdrproof.dev/docs/corpus/entries/sac-xlm-transfer-creates-account) | 4 | dropped | An account created by an XLM transfer through the native asset contract (CAP-0073) gets no ACCOUNT CREATE: wallet-backend writes one only for a CreateAccount operation. | [wallet-backend#804](https://github.com/stellar/wallet-backend/issues/804), [wallet-backend#816](https://github.com/stellar/wallet-backend/issues/816) |
| [`signer.preauth-removed-by-core`](https://xdrproof.dev/docs/corpus/entries/signer-preauth-removed-by-core) | 2 | dropped | Core removes the used pre-auth signer in txChangesBefore, outside any operation; wallet-backend never reads that change group for signers. | [wallet-backend#818](https://github.com/stellar/wallet-backend/issues/818) |

## Every fix, before and after

Each fixed failure the corpus reproduces is replayed at the commits before its fix and at the fix (`replay/sightings.json`). Each must fail before and pass at the fix.

| Issue | Ledger | Commit | Verdict | Probes that failed |
|---|---|---|---|---|
| [wallet-backend#729](https://github.com/stellar/wallet-backend/pull/729) | SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant) | `79ea2acd` | mishandled | addresses.valid, signer.added |
| [wallet-backend#729](https://github.com/stellar/wallet-backend/pull/729) | SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant) | `6e5a5910` | halted | – |
| [wallet-backend#729](https://github.com/stellar/wallet-backend/pull/729) | SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant) | `2a0a84ea` | halted | – |
| [wallet-backend#729](https://github.com/stellar/wallet-backend/pull/729) | SetOptions adds a signed-payload (P...) signer, on testnet ledger 4437357 (1 variant) | `2c873353` | handled | – |
| [wallet-backend#731](https://github.com/stellar/wallet-backend/issues/731) | a Stellar Asset Contract trust() creates a trustline with no event (CAP-0073) (4 variants) | `764a4f5b` | dropped | trustline.added |
| [wallet-backend#731](https://github.com/stellar/wallet-backend/issues/731) | a Stellar Asset Contract trust() creates a trustline with no event (CAP-0073) (4 variants) | `c152783c` | handled | – |
| [wallet-backend#753](https://github.com/stellar/wallet-backend/pull/753) | a muxed (M...) source on ExtendFootprintTTL and RestoreFootprint, with a text memo (4 variants) | `f8e5786d` | halted | – |
| [wallet-backend#753](https://github.com/stellar/wallet-backend/pull/753) | a muxed (M...) source on ExtendFootprintTTL and RestoreFootprint, with a text memo (4 variants) | `bb0b162b` | handled | – |
| [wallet-backend#745](https://github.com/stellar/wallet-backend/issues/745) | a contract deploy whose deployer is a claimable-balance (B...) address, refused by the host but in the ledger (2 variants) | `71625b21` | halted | – |
| [wallet-backend#745](https://github.com/stellar/wallet-backend/issues/745) | a contract deploy whose deployer is a claimable-balance (B...) address, refused by the host but in the ledger (2 variants) | `ce0820d7` | handled | – |
| [wallet-backend#745](https://github.com/stellar/wallet-backend/issues/745) | a contract deploy whose deployer is a liquidity-pool (L...) address, refused by the host but in the ledger (2 variants) | `71625b21` | mishandled | facts.extra |
| [wallet-backend#745](https://github.com/stellar/wallet-backend/issues/745) | a contract deploy whose deployer is a liquidity-pool (L...) address, refused by the host but in the ledger (2 variants) | `ce0820d7` | handled | – |

## A session

One session replays one ledger, one distinct variant (its bytes and its network), into a fresh store.

<Steps>
<Step>

### Derive the probes

`replay/lib/derive.mjs` reads the ledger with rs-stellar-xdr and lists the **probes**: the facts a correct indexer has stored after ingesting it. They come from the ledger alone.

</Step>
<Step>

### Serve the ledger

`replay/lib/mock-rpc.mjs` serves the ledger as stellar-rpc v30.0.1 would: `getLedgers`, `getHealth`, `getLatestLedger`, `getNetwork`, `getVersionInfo`, and `getLedgerEntries` from the state the ledger leaves behind. Pagination, page limits and validation errors follow stellar-rpc word for word.

The mock knows only what the ledger states, so it knows less than stellar-rpc in three ways, each recorded per session: a method it does not serve, or a request such as a history-archive fetch, is refused; a ledger entry the ledger does not touch is answered "not found", though on a real network it may exist; and a contract entry whose TTL the ledger leaves untouched is served without `liveUntilLedgerSeq`. A verdict other than `handled` in a session that read such state is flagged and traced in the indexer's code before it is recorded.

</Step>
<Step>

### Prepare, start and watch

The adapter gives the indexer a clean store whose cursor sits just before the ledger and starts it against the mock. The harness polls the cursor until it passes the ledger, the process exits, the cursor stops moving, or the attempt times out. Once the ledger is passed, the process must still be running a second later. If the ledger was not passed, the indexer is started once more on the same store.

</Step>
<Step>

### Observe

The adapter answers every probe from what the indexer stored, and the harness compares.

</Step>
</Steps>

Before any session counts, the harness replays the **controls**: the plainest ledger of each protocol the target can decode. Each must get past its ledger, or the run stops as a setup failure.

## Verdicts

| Verdict | Rule |
|---|---|
| `handled` | the cursor passed the ledger and every applicable probe matches |
| `dropped` | the cursor passed, and a fact the ledger states is not stored |
| `mishandled` | the cursor passed, and a stored value differs from the ledger, or an invariant fails |
| `stalled` | the first attempt stopped making progress on the ledger without exiting; the restart got past it |
| `crashed` | the first attempt exited on the ledger; the restart got past it |
| `halted` | neither attempt passed the ledger |
| `unsupported` | the ledger's protocol is newer than the target decodes, or its network is not supported |
| `error` | an adapter command failed; never a finding (the run exits 2) |

## Probes

Each probe names a fact by its key and states the expected value in a canonical form: strkeys, decimal strings, XDR enum names. A muxed `M…` account is named by its `G…` account.

| Probe | Expected |
|---|---|
| `tx.present`, `tx.result`, `tx.fee_charged`, `tx.operations`, `tx.inner_hash` | the transaction is stored, with its result code, fee charged, operation count and, for a fee bump, the inner hash |
| `tx.participant`, `op.participant` | the source and fee source are attributed to the transaction; each operation's source to its operation |
| `account.created`, `account.removed`, `contract.created` | the accounts and contract instances the transaction created or removed are recorded |
| `signer.added`, `signer.updated`, `signer.removed` | the signer change is recorded, with its new weight |
| `trustline.added`, `trustline.removed` | the trustline the transaction created or removed is recorded |
| `balance.native`, `balance.trustline` | the balance at the end of the ledger, where the ledger changes it |

Two **invariants** cover everything the indexer stored in the session: `addresses.valid` (every stored address decodes and is one the ledger names) and `facts.extra` (every stored creation, merge and trustline change is one the ledger states). Facts on which indexers differ on purpose are not asserted.

## Bring your own indexer

The indexer is reached only through an **adapter**: a directory under `replay/adapters/` with an `adapter.toml` and a few shell commands (`prepare`, `start` and `cursor` are required; `observe`, `setup`, `stop`, `finish` and `teardown` are optional). Any indexer that reads `getLedgers` can be tested the same way. An adapter that implements only the three required commands still gets `handled`, `crashed` and `halted` for every ledger. The full contract is in [replay/README.md](https://github.com/XDRProof/xdrproof/blob/main/replay/README.md).

The wallet-backend adapter builds each commit in a pinned Go image, runs TimescaleDB 2.28.2 as its compose file does, copies each session's database from a migrated template, runs `wallet-backend ingest` in live mode against the mock, and answers probes with one read of the session database.

<Callout title="A new failure, a changed one and a fixed one all fail the run">`replay/expectations/<adapter>@<target>.json` lists every variant that is not `handled`, with the exact probes that failed, the cause and the upstream issue. It also pins the set of variants judged (their count and a sha256 of their ids), so none can drop out of a run unnoticed.</Callout>
