# Upstream bugs (/docs/findings/reproduced)

Verdicts come from state, never from log text: the indexer's cursor, process and stored rows for replay, the value returned for conformance. Every row below is pinned in `replay/expectations/` or `conformance/expectations/`, so a fix upstream shows up as an unexpected pass and the row is updated. The full triage is [findings/REPORT.md](https://github.com/XDRProof/xdrproof/blob/main/findings/REPORT.md).

## wallet-backend, before and after each fix

Run by `make replay-sightings`: each fixed failure the corpus reproduces is replayed at the commits before its fix and at the fix. See [Replay](/docs/tools/replay).

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

## wallet-backend main, still open

The whole corpus replayed into `main` (<code>18db88f4</code>): 618 of 634 variants handled, 0 halted. The rest:

| Entry | Variants | Verdict | Why | Upstream |
|---|---|---|---|---|
| [`backfill.p22-refunds-in-tx-changes-after`](https://xdrproof.dev/docs/corpus/entries/backfill-p22-refunds-in-tx-changes-after) | 1 | mishandled | F-3. Before protocol 23 a Soroban fee refund is credited in txChangesAfter; wallet-backend's native balances read fee changes, operation changes and post-apply refunds (protocol 23+) only, so the 7 refunded accounts of pubnet ledger 56085459 end short by exactly their refund, while its own BALANCE history rows add up to the ledger. | not filed |
| [`contract.sac-deploy-from-asset`](https://xdrproof.dev/docs/corpus/entries/contract-sac-deploy-from-asset) | 4 | dropped | A Stellar Asset Contract deploy declares no auth entry, and wallet-backend records contract creations only from auth entries and the operation's own FromAddress preimage. | [wallet-backend#815](https://github.com/stellar/wallet-backend/issues/815) |
| [`failure.manage-buy-offer.buy-not-authorized-p22`](https://xdrproof.dev/docs/corpus/entries/failure-manage-buy-offer-buy-not-authorized-p22) | 1 | mishandled | F-3. Before protocol 23 a Soroban fee refund is credited in txChangesAfter; wallet-backend's native balances read fee changes, operation changes and post-apply refunds (protocol 23+) only, so the 7 refunded accounts of pubnet ledger 56085459 end short by exactly their refund, while its own BALANCE history rows add up to the ledger. | not filed |
| [`preauth.failing-tx-still-removes-signer`](https://xdrproof.dev/docs/corpus/entries/preauth-failing-tx-still-removes-signer) | 2 | dropped | Core removes a used pre-auth signer in txChangesBefore even when the transaction fails (CAP-0028); wallet-backend reads signer changes from operation effects only. | [wallet-backend#805](https://github.com/stellar/wallet-backend/issues/805), [wallet-backend#818](https://github.com/stellar/wallet-backend/issues/818) |
| [`revoke.cascade-offers-pool-shares`](https://xdrproof.dev/docs/corpus/entries/revoke-cascade-offers-pool-shares) | 2 | dropped | Revoking authorization redeems the holder's pool shares and deletes the pool-share trustline (CAP-0038); wallet-backend writes TRUSTLINE REMOVE only from ChangeTrust. | [wallet-backend#817](https://github.com/stellar/wallet-backend/issues/817) |
| [`sac.xlm-transfer-creates-account`](https://xdrproof.dev/docs/corpus/entries/sac-xlm-transfer-creates-account) | 4 | dropped | An account created by an XLM transfer through the native asset contract (CAP-0073) gets no ACCOUNT CREATE: wallet-backend writes one only for a CreateAccount operation. | [wallet-backend#804](https://github.com/stellar/wallet-backend/issues/804), [wallet-backend#816](https://github.com/stellar/wallet-backend/issues/816) |
| [`signer.preauth-removed-by-core`](https://xdrproof.dev/docs/corpus/entries/signer-preauth-removed-by-core) | 2 | dropped | Core removes the used pre-auth signer in txChangesBefore, outside any operation; wallet-backend never reads that change group for signers. | [wallet-backend#818](https://github.com/stellar/wallet-backend/issues/818) |

## Not reported upstream before XDRProof

| ID | Where | What | Status |
|---|---|---|---|
| F-1 | `@stellar/stellar-xdr-json` 30.0.0 | Refuses 13 corpus variants stellar-core wrote (`depth limit exceeded`): 8 with a 245-level authorization tree, the deepest that applies, and 5 at 246. It applies its `XDR_MAX_DEPTH = 500` to the whole `LedgerCloseMeta`. Every other decoder tested reads them. | not filed |
| F-2 | `stellar-sdk` 17.0.1 (Python) | `to_json` raises `Unknown SCAddress type: 5` on a CAP-0084 muxed contract address that `from_xdr` decodes (2 corpus variants). | fixed on main by the switch to `stellar-xdr` ([py-stellar-base#1268](https://github.com/StellarCN/py-stellar-base/pull/1268)); `stellar-xdr` 0.2.1 passes |
| F-3 | wallet-backend `main`, native balances | Before protocol 23 a Soroban fee refund is credited in `txChangesAfter`, which wallet-backend's native balances never read. On pubnet ledger 56085459 (protocol 22) the 7 refunded accounts end short by exactly their refund, while its own `BALANCE` history rows add up to the ledger. It bites when live ingestion processes protocol 20–22 ledgers, such as a catch-up from the data lake. | not filed |

Filing F-1 and F-3 is the maintainers' call. Issues that would let anyone halt or crash an indexer are handled under the disclosure policy (`findings/policy.md`) and are not listed here.

## In the SDKs

Run by `make conformance`: the same corpus and vectors through every build. See [Conformance](/docs/tools/conformance).

| Where | What | Upstream |
|---|---|---|
| js-stellar-sdk 17.2.0, 17.2.1 | Assets ordered by strkey text instead of XDR bytes | [js-stellar-sdk#1766](https://github.com/stellar/js-stellar-sdk/issues/1766), fixed in 17.2.1 |
| go-stellar-sdk v0.7.1 | The #1766 twin | fixed in v0.7.2 |
| js-stellar-sdk 17.2.0, 17.2.1 | Muxed IDs and offer IDs accepted in non-canonical forms; offer IDs past 2^53 rounded | [js-stellar-sdk#1785](https://github.com/stellar/js-stellar-sdk/issues/1785), fixed in 17.3.0 |
| js-stellar-sdk 17.2.0, 17.2.1 | Map keys that collide on native conversion, silently dropped | [js-stellar-sdk#1789](https://github.com/stellar/js-stellar-sdk/issues/1789), fixed in 17.3.0 |
| py-stellar-base 17.0.1 | `scval.to_native` keeps 2 of 5 colliding map keys, silently | [py-stellar-base#1250](https://github.com/StellarCN/py-stellar-base/issues/1250), fixed on main |
| py-stellar-base 17.0.1 | Accepts non-zero XDR padding, an optional flag of 2 and a bool of 2 | [py-stellar-base#1262](https://github.com/StellarCN/py-stellar-base/issues/1262), [py-stellar-base#1263](https://github.com/StellarCN/py-stellar-base/issues/1263), fixed on main |
| py-stellar-base 17.0.1 | SEP-0051 JSON differs in four places (result codes, `ClawbackOp.from_`, `AllowTrustOp.asset`, `contract_id` as hex). With those four allowed, its JSON equals rs-stellar-xdr's on every variant | [py-stellar-base#1269](https://github.com/StellarCN/py-stellar-base/issues/1269), fixed on main |
| rs-stellar-xdr 30.0.0, native and WASM | A bool of 2 decodes as `false` and re-encodes as 0; stellar-core reads it as true | [rs-stellar-xdr#622](https://github.com/stellar/rs-stellar-xdr/issues/622), open |
| go-stellar-sdk v0.9.0 | `strkey.DecodeAny` accepts SEP-0023's invalid claimable-balance key with a non-zero type byte | [go-stellar-sdk#6042](https://github.com/stellar/go-stellar-sdk/issues/6042), [go-stellar-sdk#6046](https://github.com/stellar/go-stellar-sdk/issues/6046), open |
