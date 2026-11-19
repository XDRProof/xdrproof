# Layer B: Values and encodings (/docs/hazards/layer-b)

Asset ordering, map keys that collide, amounts past 2⁵³, wide integers, invalid UTF-8, maximum lengths, nesting depth, and an authorization signed over bytes it does not contain: values that change, or break, when they are converted, decoded or verified.

**Why it matters.** A value that changes when it is converted is a wrong number in front of a user: an amount rounded, a map key lost, a signature that won't verify.

### H-B1: Asset ordering by strkey text instead of XDR bytes

In the corpus. Checks: conformance.

Evidence: [js-stellar-sdk#1766](https://github.com/stellar/js-stellar-sdk/issues/1766), [go-stellar-sdk#5974](https://github.com/stellar/go-stellar-sdk/issues/5974), StellarCN/[py-stellar-base#1246](https://github.com/StellarCN/py-stellar-base/issues/1246)

Test: API vectors (exist); a pool whose issuers sort differently by text and bytes, as a real ledger: c-base `pool-issuers-sort-differently-by-text-and-bytes`

### H-B2: ScMap keys that collide after native conversion

In the corpus. Checks: conformance.

Evidence: [js-stellar-sdk#1789](https://github.com/stellar/js-stellar-sdk/issues/1789)

Test: As value S19 (shipped), as key S20, in events, return value

### H-B3: Amounts: int64 max, precision beyond 2^53, float conversion

In the corpus. Checks: conformance, replay probe.

Evidence: [stellar-etl#454](https://github.com/stellar/stellar-etl/issues/454); js #1785 (offer id > 2^53)

Test: Trustline limit i64::MAX C9/S5; balances > 2^53 stroops: c-base `create-whale-1e9-xlm`, `payment-above-2-pow-53-stroops`; offer ids above 2^53 (API vector)

### H-B4: Wide integers (u128/i128/u256/i256), timepoint, duration at extremes

In the corpus. Checks: conformance, replay probe.

Evidence: Soroban token amounts are i128 ([stellar-etl#454](https://github.com/stellar/stellar-etl/issues/454))

Test: Every type at min/max: s-base `scval-every-number-and-time-type`; boundaries where a signed reading of the low 64 bits goes wrong (i128 2^63, -2^63, -1; u256 2^127; timepoint 2^63): `scval-wide-integer-boundaries`; a SAC balance held by a contract above int64 max: `sac-mint-to-contract-beyond-int64`

### H-B5: Bytes that are not valid UTF-8 in "string" fields

In the corpus. Checks: conformance, guide, replay probe.

Evidence: [js-stellar-sdk#1823](https://github.com/stellar/js-stellar-sdk/issues/1823); core output becomes invalid JSON (R08)

Test: Memo text C26 + mainnet `M:memo-text-non-utf8`; ScString S28; manage-data binary C24 + mainnet; home domain and data name cannot hold non-ASCII: core requires printable ASCII (SetOptionsOpFrame.cpp:320, ManageDataOpFrame.cpp:115, util/types.cpp isStringValid)

### H-B6: Maximum lengths (VecM limits), and one past them

In the corpus. Checks: conformance.

Evidence: [rs-stellar-xdr#581](https://github.com/stellar/rs-stellar-xdr/issues/581), #598

Test: 20 signatures + 32-byte symbol S26; 64-byte data value C24; 32-byte home domain C8; 28-byte memo C26; 100 operations c-base `operations-100-muxed-ids`; max signers 20 S25; over-length as lane S (SDK only), planned in B5

### H-B7: Nesting depth: auth trees, nested ScVal; caps that fail the ledger

In the corpus. Checks: conformance, linter, replay probe.

Evidence: [wallet-backend#820](https://github.com/stellar/wallet-backend/issues/820); R03 depth ladders

Test: Auth depth 6 S21, 245 S22, 246 S23; nested ScVal ladder (API vectors exist); a contract deploy whose auth root carries a 245-deep chain (the walk patched for #820 runs only when an instance is created): s-base `deploy-with-auth-tree-depth-245`

### H-B8: Non-canonical encodings decoders disagree on

Not in the corpus yet. Checks: conformance.

Evidence: [rs-stellar-xdr#622](https://github.com/stellar/rs-stellar-xdr/issues/622) / [stellar-core#5509](https://github.com/stellar/stellar-core/issues/5509) (bool word 2), [js-xdr#165](https://github.com/stellar/js-xdr/issues/165) (float discriminants)

Test: Lane S synthetic vectors, SDK-only todo

### H-B9: Alphanumeric-12 asset codes; codes like "xlm"

In the corpus. Checks: conformance, replay probe.

Evidence: [js-stellar-sdk#1787](https://github.com/stellar/js-stellar-sdk/issues/1787)

Test: Alphanum-12 C9, C11, C14; mainnet `M:alphanum12-asset`; issued "xlm" code c-base `trust-issued-xlm-code`, `payment-issued-xlm-code`

### H-B10: JSON number vs string for 64-bit values

In the corpus. Checks: conformance.

Evidence: [rs-stellar-xdr#625](https://github.com/stellar/rs-stellar-xdr/issues/625); [stellar-etl#455](https://github.com/stellar/stellar-etl/issues/455)

Test: Covered by facts on 64-bit fields (exact strings)

### H-B11: Offer price edges: `Price{n,d}` at int32 extremes; prices as floats

In the corpus. Checks: conformance, verify facts.

Evidence: [js-stellar-sdk#1843](https://github.com/stellar/js-stellar-sdk/issues/1843)/#1750; [stellar-etl#454](https://github.com/stellar/stellar-etl/issues/454)

Test: manageSellOffer at n = 2^31−1/d = 1 and n = 1/d = 2^31−1

### H-B12: Maximum lengths not yet tested: `path<5>`, `claimants<10>`, `extraSigners<2>`, `dataName` 64, `operations<100>`, AllowTrust 12-char code

In the corpus. Checks: conformance, verify facts.

Evidence: RFP F14 "vectors at their maximum length"

Test: One ledger of vectors at their XDR maximum: path<5> (six offers crossed), claimants<10> with a depth-4 predicate (the core limit, CreateClaimableBalanceOpFrame.cpp:78), extraSigners<2>, 64-byte data name with a 64-byte value, AllowTrust with a 12-character code: c-base `vectors-at-maximum-length`; operations<100> alone in its ledger (the classic set holds exactly 100 operations): `operations-100-muxed-ids`

### H-B13: A valid ledger common decoders cannot read (depth)

In the corpus. Checks: conformance.

Evidence: measured: stellar-xdr-json WASM fails on S22/S23; Python 512 and Java 200 default depths

Test: planned: the S22/S23 recipe ledgers (s-base `auth-tree-depth-245-max`, `auth-tree-depth-246-trapped`) as entries in B4, expected divergences pre-registered in B5

### H-B14: Recursive delegate signatures (CAP-0071 `nestedDelegates`)

In the corpus. Checks: conformance, linter.

Evidence: cap-index.md:120; randxdr preset

Test: Custom accounts that authenticate only by delegation (kit2 __check_auth with delegate_auth): CA1 -> CA2 -> CA3 -> bob, three levels of nestedDelegates in SOROBAN_CREDENTIALS_ADDRESS_WITH_DELEGATES, payload bound to CA1: s-base `custom-account-nested-delegates`; XP002 recursive types include it

### H-B15: SorobanCredentials arms beyond ADDRESS (CAP-0071): ADDRESS_V2 binds the signature payload to the address

In the corpus. Checks: conformance, replay probe, linter.

Evidence: CAP-0071-02 (SOROBAN_CREDENTIALS_ADDRESS_V2 = 2); measured on s-base address-v2-credentials. Readers that parse credentials as source-account or ADDRESS only, or recompute the payload without the address, fail

Test: s-base `address-v2-credentials`; ADDRESS_WITH_DELEGATES in `custom-account-nested-delegates` (H-B14)

### H-B16: An auth entry's signature does not cover its own bytes: a CREATE_CONTRACT_HOST_FN authorization is signed over its V2 rendering (by design since protocol 22)

In the corpus. Checks: conformance, guide.

Evidence: By design since protocol 22: to keep one valid payload per action, the host hashes a v1 create authorization in its CREATE_CONTRACT_V2_HOST_FN rendering (maintainer reasoning in github.com/orgs/stellar/discussions/1501; CAP-0058 keeps the v1 arm usable for zero-argument creations). Code: soroban-env-host auth.rs as stellar-core v30 links it (30.0.0 @6e6c4a87 for protocol 30, 28.0.0 @ba37ea5f for protocol 28; lines 778, 803, 2641). Measured on core v30 at protocols 28 and 30, and re-checked by tools/auth-payload-check.mjs with hand-encoded preimages and node:crypto: the entry signed over its own bytes (as js-stellar-base authorizeEntry signs it) verifies only as v1 and core fails it; the entry core accepts verifies only as V2. Offline signers that sign the entry bytes, and verifiers that recompute the payload from them, get v1 creates wrong; transactions built through RPC simulation get the V2 payload.

Test: s-base `create-contract-v1-auth-signed-over-own-bytes` (fails) and `create-contract-v1-auth-signed-over-v2-rendering` (succeeds)

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
