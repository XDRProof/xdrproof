# Found while building (/docs/findings)

**What it is.** What building the corpus measured about stellar-core and the decoders: things the documentation doesn't say.

**Why it matters.** Each one is a trap for anyone reading the ledger, and each is now a test in the corpus.

Each finding says where it comes from: a committed measurement, a mined ledger, or an observation on recipe runs. The recipe runs themselves are not shipped. The recipes are, along with the order-scan and flag-profile results.

## stellar-core emits some operation changes in a random order

Across 20 fresh runs of each recipe lane, 33 of 103 classic recipe ledgers and 16 of 92 Soroban ones came out in more than one byte order (the protocol-upgrade ledger aside, which varies too). Their headers and content were identical. 5 classic ledgers (12, 14, 78, 80, 84) had a different order in every run. The cause is hash-map iteration with a per-process random salt. Measured by [`make order-scan`](/docs/tools/order-scan); the results are committed in `recipes/*/order-scan/`.

<Callout type="warn" title="For indexers">Never depend on the order of changes within an operation.</Callout>

## Node flags change the metadata, never the ledger

The recipes were run under the three [flag profiles](/docs/corpus/recipes) (base, Galexie and bare). Every ledger of both lanes keeps the same header hash.

- **Bare** changes the metadata content of every ledger except the protocol-upgrade one. There are no classic events, no fee events, and v0 meta extensions.
- **Galexie's** extra flags change no classic ledger, and 46 Soroban ones: every ledger with a contract call. In those, each contract event appears twice, in the operation's events and again among the diagnostic events.

[`make generate`](/docs/tools/generate) re-measures this into `recipes/<lane>/profiles/`.

## A Soroban ledger written with diagnostic events on is not byte-reproducible

Every call carries a `core_metrics` diagnostic event, `invoke_time_nsecs`: the wall-clock time the host spent. Two nodes running Galexie's default config write different bytes for the same ledger. The corpus's normalised form zeroes that one value.

## The public data lake carries TransactionMeta v4, even for 2019 ledgers

Every lake object inspected, at protocols 12, 22 and 29, has v4 meta. The protocol-12 mainnet ledger in [`mined/`](/docs/corpus/mined) has v4 meta and 532 V0 envelopes. This is because Galexie sets `BACKFILL_STELLAR_ASSET_EVENTS`, which makes stellar-core write v4 at any protocol. A default node replaying the same ledger writes v2 (v3 for protocols 20–22). Only the `LedgerCloseMeta` arm varies by era: v0 at protocol 12, v1 at 22, v2 at 29.

## A Soroban fee source merged earlier in the same ledger gets no refund

`fee_charged` is then the full declared maximum, with no refund change and no refund event. A reader that computes the fee as the charge minus the refund, or that expects a refund for every Soroban transaction, gets it wrong.

## stellar-core's own golden ledgers reach 254 of 499 arms

A `LedgerCloseMeta` reader can meet 499 XDR union arms at v30.0. stellar-core's own golden ledger files reach 254 of them. For comparison, the corpus entries reach 417 and the mined ledgers 289 ([Coverage](/docs/tools/coverage)). Many of the missing arms are result codes that never appear in a closed ledger. Measured by [`make coverage-goldens`](/docs/tools/coverage) against stellar-core commit `f2b91947`.

## Soroban authorization trees apply up to 245 levels deep

At Protocol 30, an authorization tree 245 levels deep applies. At 246 the transaction is included, but traps. Any indexer cap below about 246 meets real, valid ledgers. Re-checked by `make verify` on the entries [`auth.tree-depth-245-max`](/docs/corpus/entries/auth-tree-depth-245-max) and [`auth.tree-depth-246-trapped`](/docs/corpus/entries/auth-tree-depth-246-trapped).

## The WASM build of rs-stellar-xdr cannot decode those ledgers

`@stellar/stellar-xdr-json` 30.0.0, rs-stellar-xdr compiled to WASM, refuses 13 corpus variants that stellar-core wrote (`depth limit exceeded`): 8 whose authorization tree is 245 levels deep, the deepest that applies, and 5 at 246, which core includes and traps. The package hard-codes `XDR_MAX_DEPTH = 500`, set to mirror the Soroban host's budget limit, and applies it to the whole `LedgerCloseMeta`, whose path down to the auth tree is deeper. js-stellar-sdk 17.4.0, go-stellar-sdk v0.9.0, both Python decoders and native rs-stellar-xdr read them. This is finding F-1, reported as [js-stellar-xdr-json#67](https://github.com/stellar/js-stellar-xdr-json/issues/67); see [Reported upstream](/docs/findings/reported).

Figure (animated): how deep is too deep. Counted from the authorization entry, as stellar-core counts, the deepest tree it applies needs depth 499, under the limit of 500. Counted from the transaction it needs 507, and from the ledger 519; @stellar/stellar-xdr-json counts from the ledger and refuses it.

## A create-contract authorization is signed over bytes it does not contain

A valid v1 create-contract authorization is signed over its V2 rendering. The host reads `SOROBAN_AUTHORIZED_FUNCTION_TYPE_CREATE_CONTRACT_HOST_FN` into its V2 form and hashes the signature payload from the `CREATE_CONTRACT_V2_HOST_FN` rendering (soroban-env-host `auth.rs`, as stellar-core v30 links it at protocols 28 and 30). Signed over its own bytes, as js-stellar-base's `authorizeEntry` signs it, the entry fails ed25519 verification; signed over the V2 rendering, the contract is created.

This is by design since protocol 22, to keep one valid payload per action ([stellar discussion #1501](https://github.com/orgs/stellar/discussions/1501)). Transactions built through RPC simulation get it right; offline signers must sign the V2 rendering. A verifier that recomputes the payload from the entry rejects a signature core accepted (hazard [H-B16](/docs/hazards/layer-b#h-b16)). `tools/auth-payload-check.mjs` re-checks it with hand-encoded preimages, no SDK.

## Codes read as submission-only appear in closed ledgers

Core re-checks sequence numbers, signatures and preconditions at apply. So a classic transaction earlier in the same ledger can make a queued Soroban transaction fail with `txBAD_AUTH_EXTRA` (a signature needed at submission becomes surplus once a master weight rises), and fee-bump inner transactions fail with `txBAD_SEQ`, `txNO_ACCOUNT`, `txBAD_AUTH`, `txBAD_AUTH_EXTRA` or `txBAD_MIN_SEQ_AGE_OR_GAP` inside `txFEE_BUMP_INNER_FAILED`. The corpus's failed-transaction family holds them.

## Order across ledger keys is unstable; the pairing for one key is stable

Between core processes, the order across different ledger keys changes. The STATE → UPDATED pairing for one key does not. Readers can rely on the pairing, never on the order between keys.
