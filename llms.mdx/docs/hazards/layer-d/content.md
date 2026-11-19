# Layer D: State changes no operation explains (/docs/hazards/layer-d)

Ledger entries created, updated or removed by something other than an operation that names them: trustlines from contract calls, eviction, restores, revocation.

**Why it matters.** A reader that only looks at operations misses state that changed for other reasons, and its balances drift away from the ledger.

### H-D1: Contract call creates a classic trustline (no CHANGE_TRUST, no event)

In the corpus. Checks: replay probe.

Evidence: [wallet-backend#731](https://github.com/stellar/wallet-backend/issues/731), [stellar-etl#460](https://github.com/stellar/stellar-etl/issues/460)

Test: S5 (source auth), S6 (address auth), S7 (no-op on existing), P28 variants

### H-D2: XLM SAC transfer creates an account

In the corpus. Checks: replay probe.

Evidence: CAP-0073

Test: S10

### H-D3: Pre-auth signer disappears; sponsorship moves between accounts

In the corpus. Checks: replay probe.

Evidence: 

Test: C35, C23, C44

### H-D4: TTL extend and restore change entries with no value change

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#461](https://github.com/stellar/stellar-etl/issues/461) (misnamed restored-key hash)

Test: S29, S30, mainnet extend/restore; archived → restored (`LEDGER_ENTRY_RESTORED`): s-base `archival-restore-footprint`, `archival-automatic-restore-in-invoke`

### H-D5: Contract wasm upgrade, contract creation (constructor args, salt)

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) (salt omitted)

Test: S12–S18, mainnet `M:soroban-wasm-upgrade`

### H-D6: Entries removed by no transaction: eviction (`evicted_keys`), hot archive

In the corpus. Checks: replay probe.

Evidence: CAP-0062; [stellar-etl#461](https://github.com/stellar/stellar-etl/issues/461)

Test: Generated: after a config upgrade to the minimum lifetimes and an eviction scan from level 1, ledgers with no transactions carry evicted_keys: three persistent entries archived to the hot archive 10 ledgers after creation, temporary entries deleted (including older ones the scan reached): s-base `archival-empty-ledgers`; mined: pubnet 65460631 evicts 1000 contract-data entries and their 1000 TTL keys in a ledger with 162 transactions: exactly maxEntriesToArchive, which counts entries, not keys (BucketManager.cpp:1243-1268), and was 1000 on mainnet from pubnet 59516381 (mined/queries/q17_state_archival_setting.sql; at pubnet 59313516 it was briefly 0, pausing eviction)

### H-D7: Automatic restore inside InvokeHostFunction (`archivedSorobanEntries`, `SorobanTransactionDataExt.1`) vs RestoreFootprint

In the corpus. Checks: replay probe.

Evidence: CAP-0066

Test: One ledger, two restores of evicted persistent entries: an InvokeHostFunction whose SorobanTransactionDataExt v1 marks readWrite[0] archived, giving restored then updated changes for the same key in one operation (CAP-0066), and a RestoreFootprint giving restored changes only: s-base `archival-automatic-restore-in-invoke`, `archival-restore-footprint`

### H-D8: TTL entries name data only by `sha256(LedgerKey)`

In the corpus. Checks: conformance, verify facts.

Evidence: [stellar-etl#461](https://github.com/stellar/stellar-etl/issues/461)

Test: Fact on S29: `key_hash = sha256(LedgerKey(...))`; conformance op `ledger_key_hash`

### H-D9: Revoking authorization removes offers and turns pool shares into new claimable balances (no create op)

In the corpus. Checks: replay probe.

Evidence: [wallet-backend#817](https://github.com/stellar/wallet-backend/issues/817); [stellar-etl#458](https://github.com/stellar/stellar-etl/issues/458); [go-stellar-sdk#5974](https://github.com/stellar/go-stellar-sdk/issues/5974)

Test: The issuer fully deauthorizes mm's XPF trustline: three offers removed, two claimable balances created from redeemed pool shares (no create op), pool-share trustline removed, and the liquidity pool entry itself removed because mm was its last shareholder: c-base `revoke-trustline-with-offers-and-pool-shares`

### H-D10: Contract-data identity is (contract, key, durability); instance storage; a non-SAC `["Balance", G]` key

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#459](https://github.com/stellar/stellar-etl/issues/459)

Test: One contract, one key, two durabilities: (CA1, "dup", persistent) and (CA1, "dup", temporary), plus the same key in instance storage: s-base `kit2-same-key-three-durabilities`; a non-SAC contract storing a SAC-shaped ["Balance", bob] key: `kit-put-sac-shaped-balance-key`

### H-D11: External-ref executables (CAP-0085): `CONTRACT_EXECUTABLE_EXTERNAL_REF`, `SCV_EXECUTABLE_TAG`

In the corpus. Checks: conformance, replay probe.

Evidence: cap-index.md:123; [stellar-etl#470](https://github.com/stellar/stellar-etl/issues/470)

Test: Executable-reference entry keyed by SCV_EXECUTABLE_TAG "kit" in CA1: s-base `kit2-set-executable-ref`; CreateContractV2 with CONTRACT_EXECUTABLE_EXTERNAL_REF: `deploy-external-ref-executable`; that contract running the referenced Wasm: `invoke-external-ref-contract`

### H-D12: Frozen keys (CAP-0077): `txFROZEN_KEY_ACCESSED`, `*_TRUSTLINE_FROZEN`, offers removed

In the corpus. Checks: replay probe, verify facts.

Evidence: [wallet-backend#754](https://github.com/stellar/wallet-backend/issues/754) halt; cap-index.md:114

Test: CAP-0077 apply-time paths after freezing three trustlines: CLAIM_CLAIMABLE_BALANCE_TRUSTLINE_FROZEN, LIQUIDITY_POOL_DEPOSIT_TRUSTLINE_FROZEN, LIQUIDITY_POOL_WITHDRAW_TRUSTLINE_FROZEN, and a path payment that removes an offer whose seller trustline is frozen (nothing moved; the frozen trustline is still updated to release liabilities): s-base `frozen-*`. txFROZEN_KEY_ACCESSED is unreachable in a closed ledger: the check (TransactionFrame.cpp:1485) uses the same last-closed-ledger config at validation and apply, and queued transactions are re-validated after every close. Mined: pubnet 65273932, a mainnet config upgrade that freezes a fourth account

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
