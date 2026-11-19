# Layer E: Events (/docs/hazards/layer-e)

Unified events (CAP-0067), event data carrying muxed IDs and deep maps, and diagnostic events emitted twice.

**Why it matters.** Events are the easiest way to follow contract activity, and the easiest to over-trust: some repeat, some carry deep data, some come from failed calls.

### H-E1: Unified events (CAP-0067): classic ops emit events; fee events before and after all txs

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#452](https://github.com/stellar/stellar-etl/issues/452)

Test: Every C-ledger (events counted), S-ledgers (fee events)

### H-E2: Event data carrying muxed IDs (`to_muxed_id`), maps, deep ScVal

In the corpus. Checks: conformance, replay probe.

Evidence: CAP-0067, [wallet-backend#756](https://github.com/stellar/wallet-backend/issues/756)

Test: S11, S19, S28, mainnet `M:soroban-event-deep-scval`

### H-E3: Diagnostic events double-emitted

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#452](https://github.com/stellar/stellar-etl/issues/452)

Test: Galexie flag profile (recipes/flags/galexie.cfg, ENABLE_SOROBAN_DIAGNOSTIC_EVENTS): each contract event appears twice, in operations[].events and again as a contract-type diagnostic event. The diagnostic core_metrics event invoke_time_nsecs is wall-clock time, so these ledgers are not byte-reproducible; the normalised form zeroes it (tools/lib.mjs normalise)

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
