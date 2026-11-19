# Layer F: Ledger level (/docs/hazards/layer-f)

Upgrade ledgers, empty and very large ledgers, parallel Soroban stages, change order that varies between core processes, and the same ledger in different bytes.

**Why it matters.** Code tested on ordinary ledgers meets the unusual ones at upgrades and peaks: empty, huge, reordered or upgraded ledgers.

### H-F1: Protocol-upgrade ledgers (config settings, version, StellarValueExt)

In the corpus. Checks: replay probe.

Evidence: R02 (`'3' is not a valid StellarValueType`)

Test: Mainnet `M:protocol-upgrade` (P→current), testnet P30 upgrade; never generated (non-deterministic)

### H-F2: P30 `StellarValue` signed_ms (CAP-0088)

In the corpus. Checks: conformance.

Evidence: R01

Test: Testnet `M:protocol-30-signed-ms`; every P30 recipe ledger

### H-F3: Large ledgers (memory, many transactions)

In the corpus. Checks: replay probe.

Evidence: N4

Test: Mainnet `M:largest-ledger`

### H-F4: Empty ledgers (no transactions)

In the corpus. Checks: replay probe.

Evidence: `STELLAR_VALUE_EMPTY_TX_SET*` arms

Test: c-base `empty-ledger`; s-base `archival-empty-ledgers` (16 ledgers whose only content is eviction)

### H-F5: Parallel Soroban execution stages (several stages, several clusters)

In the corpus. Checks: replay probe.

Evidence: R08 objection 3

Test: Mined mainnet: pubnet 65485185 has 3 stages with 1, 2 and 1 clusters; pubnet 65506631 and 65517506 have 2 clusters in one stage. Generated ledgers put independent transactions in one cluster unless instruction budgets force bins apart, and equal bids make that split depend on a random tie-break (ParallelTxSetBuilder.cpp:717)

### H-F6: Change order within an operation varies between core processes

In the corpus. Checks: replay probe.

Evidence: R09

Test: Order-variant raw bytes shipped as variants

### H-F7: `LedgerCloseMetaExt` v1 (Galexie) vs v0 (RPC) for the same ledger

In the corpus. Checks: conformance, replay probe.

Evidence: R01

Test: Every run under the base profile (LedgerCloseMetaExt v1) and the bare profile (v0); same header hash, different bytes (recipes/flags)

### H-F8: Meta version polymorphism on backfill: LCM v0/v1, TxMeta v2/v3, V0 envelopes, refunds in `txChangesAfter` (P20–22)

In the corpus. Checks: replay probe.

Evidence: ledger-close-meta.md:85-105

Test: Mined: pubnet 26588352 (P12: LedgerCloseMeta v0, 532 TransactionEnvelope V0) and pubnet 56085459 (P22: LedgerCloseMeta v1, Soroban fee refunds in txChangesAfter for 53 transactions). Every lake object inspected (protocols 12, 22 and 29) carries TransactionMeta v4, because Galexie sets BACKFILL_STELLAR_ASSET_EVENTS, which makes stellar-core emit v4 (TransactionMeta.cpp:532-536; the lake objects name stellar-core 23.0.1 as writer); a default node writes v2 before protocol 20 and v3 for 20-22, for the same ledgers

### H-F9: Same ledger, different bytes by node flags (six Galexie flags vs RPC defaults)

In the corpus. Checks: replay probe.

Evidence: ledger-close-meta.md:390-406

Test: Every run under three profiles (recipes/flags: base, galexie, bare), compared on normalised content by tools/profile-compare.mjs in make generate (recipes/<lane>/profiles/p30-mainnet.json): every ledger keeps the same header hash; bare differs from base in every ledger but the protocol-upgrade one; galexie differs from base in no classic ledger and in the 46 Soroban ledgers with contract calls (diagnostic events); variant keys carry the profile suffix

### H-F10: Config-settings upgrade ledgers (`LEDGER_UPGRADE_CONFIG`; changes in `upgradesProcessing`)

In the corpus. Checks: replay probe.

Evidence: 18 ConfigSettingEntry arms uncovered

Test: Generated: two LEDGER_UPGRADE_CONFIG ledgers whose upgradesProcessing updates contract_execution_lanes and frozen_ledger_keys, staged by kit2 as a temporary entry (Upgrades.cpp ConfigUpgradeSetFrame::makeFromKey): s-base `config-upgrade-lanes-and-freeze`, `config-upgrade-restore-and-unfreeze`; mined: pubnet 65080525, a settings vote updating 7 entries in one upgrade (including ledger_max_dependent_tx_clusters 3), and pubnet 65273932, whose upgrade grows the frozen-key list from 3 to 4 accounts

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
