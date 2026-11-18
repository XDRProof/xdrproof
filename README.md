# XDRProof

**Test your Stellar indexer and SDK against the ledger's rarest shapes.**

XDRProof is a shared corpus of rare but valid Stellar ledger data, as bytes stellar-core actually emitted. Each entry is tagged with the CAP that introduced it and carries the values a correct reader must return. Around the corpus sit tools that replay it into indexers, run it through the JavaScript, Go and Rust SDKs, and lint indexer code for three known ingestion mistakes.

> **Status: early, built in public.** This repository backs our proposal to the Stellar Community Fund's RFP *XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide* (SCF #46). It holds the manifest schema, the hazard registry, the first corpus entries, the generator recipes and runnable reproductions of real upstream bugs. The corpus grows entry by entry from here; every number below is re-measured by the command next to it.

## Built from a failure-mode blueprint

[`caps/registry.json`](caps/registry.json) lists **75 hazards**: named ways readers of the Stellar ledger break, in eight layers. Examples: a muxed account stored without its ID, a contract call that creates a trustline with no event, a failed transaction that still changes state, a valid ledger a decoder refuses. Each hazard carries its evidence: an upstream issue, a protocol rule or a measurement. Every corpus entry names the hazards it targets and where in the XDR they sit, so the corpus grows by purpose, not by volume.

## Check every claim yourself

| Command | What it proves | Needs | Time |
|---|---|---|---|
| `make verify` | Every entry matches the schema and names known hazards; sha256 and size match; every variant **round-trips byte-for-byte through native rs-stellar-xdr 30.0.0** (depth limit 1500); its focus transaction is present; every expected fact holds; `manifest.json` is current. A second reader, the WASM build `@stellar/stellar-xdr-json`, must agree wherever it can decode | Node ≥ 22.15, Rust | seconds (first build ~1 min) |
| `make oracle` | Every value-checkable fact is **confirmed by stellar-core's own decoder** (C++ `dump-xdr`, no code shared with any SDK) **and by XDRProof's schema walker** (no SDK); a planted one-digit error in a 64-bit value is caught by both | Docker | seconds |
| `make coverage` | 499 XDR union arms are reachable from `LedgerCloseMeta` at v30.0; the three entries here reach 78 | Python 3 | seconds |
| `make coverage-goldens` | stellar-core's own 866 golden ledger files reach **254 of 499** | + git (downloads ~76 MB once) | ~1 min |
| `make generate` | Every recipe run is rebuilt **twice from scratch** by a bare standalone stellar-core v30.0.0, pinned by image digest (no RPC, no network, no keys or funds): both lanes, mainnet and testnet passphrases, Soroban at P30 and P28, three emitter-flag profiles. Every pair agrees, byte for byte or after normalisation, and every shipped generated variant is reproduced | Docker | ~10 min (`make generate-quick` ~3 min) |
| `make order-scan` | 20 fresh runs per lane record which ledgers come out in more than one byte order, and prove the content never varies | Docker | ~15 min |
| `make conformance` | js-stellar-sdk **#1766, #1785, #1789 fail on pre-fix tags and pass on fixed ones**, and #1766's twin fails on go-stellar-sdk v0.7.1 and passes on v0.7.2 | Node, Rust, Docker | ~5 min cold |
| `make replay` | Real wallet-backend builds fed corpus ledgers through a mock stellar-rpc. Testnet 4437356–4437359: **#729 halts** before the fix, **#716 stores the signer as 33 bytes**, the fix stores the full 41-byte key. Our own CAP-0073 entry: **#731 drops the trustline** (no TRUSTLINE/ADD) before the fix, records it after | Docker | ~10 min cold |

Verdicts come from state (process exit, ingest cursor, stored bytes), never from log text.

## The three sample entries

| Entry | CAP | Why readers break on it | Reproduces | Variants |
|---|---|---|---|---|
| [`signer.signed-payload.set-options`](entries/signer.signed-payload.set-options/entry.json) | CAP-0040 | A signer whose strkey (`P…`) carries a payload, up to 165 characters | wallet-backend#729, #716 | P28 testnet, **mined** from SDF's public lake; P30 mainnet and testnet passphrases, generated |
| [`sac.trust.creates-trustline`](entries/sac.trust.creates-trustline/entry.json) | CAP-0073 | A contract call creates a classic trustline: no CHANGE_TRUST operation, no event, only a created ledger entry | wallet-backend#731 | P30 and P28, generated |
| [`scval.map.keys-collide-on-native-conversion`](entries/scval.map.keys-collide-on-native-conversion/entry.json) | CAP-0046 | Five distinct map keys (u32 1, i32 1, u64 1, "1", symbol 1) all read as `"1"` once converted to a native object | js-stellar-sdk#1789 | P30, generated |

Every expected value says what backs it: `construction` (we built the transaction with that value), `snapshot` (the SEP-0051 rendering by the pinned stellar-xdr crate), `core`, `walker` or `review`. No expected value is accepted on one decoder's word alone.

## The manifest schema

[`schema/v1/entry.schema.json`](schema/v1/entry.schema.json) is JSON Schema 2020-12. The RFP's required fields map as:

| RFP field | Schema |
|---|---|
| Entry ID | `id` + `variants[].key` (permanent; never reused) |
| CAP | `caps` |
| Protocol version | `variants[].protocol` |
| Source | `variants[].source` (`mined` with lake URL and sha256, or `generated` with core version, emitter flags and recipe) |
| Synthetic flag | `variants[].synthetic` (with `emittable` when true) |
| Expected decoded values | `expected.facts` (order-independent where needed) and `expected.sdk_checks` |

Beyond the RFP's fields, each entry names its `hazards` (with the `placement` in the XDR), and each variant its `focus` transaction. Variants may be zstd-compressed (large mainnet ledgers); size and sha256 describe the decompressed bytes.

[`manifest.json`](manifest.json) is generated from the entries: one row per variant.

## Found while building this

- **stellar-core emits some operation changes in a random order.** Across 20 fresh runs of each recipe lane (`make order-scan`), 18 of 80 classic ledgers and 13 of 80 Soroban ledgers came out in more than one byte order, with identical headers and identical content; two classic ledgers (offers, claimable balances and pool shares changing together) had a different order in every run. The cause is hash-map iteration with a per-process random salt. Entries whose order varies pin an order-normalised hash and list every raw ordering seen (`recipes/*/order-scan/`). An indexer must never depend on change order.
- **stellar-core's own golden ledgers reach 254 of the 499 arms** a `LedgerCloseMeta` reader can meet. Many of the missing arms are result codes that never appear in a closed ledger. The corpus will publish which of the rest it covers, and why the others are unreachable.
- **Soroban authorization trees up to 245 levels deep apply at Protocol 30; at 246 the transaction is included but traps.** So any indexer cap below about 246 meets real, valid ledgers.
- **The WASM build of rs-stellar-xdr (`@stellar/stellar-xdr-json` 30.0.0) cannot decode those 245-deep ledgers** (`depth limit exceeded`), while native rs-stellar-xdr decodes them. To be reported upstream once checked for duplicates.
- **Order across ledger keys is unstable between core processes; the STATE → UPDATED pairing for one key is stable.** Readers can rely on the pairing, never on the order between keys.
- **Node flags change every byte of the metadata and never the ledger.** Across the 80 ledgers of each recipe lane, the base, Galexie and bare flag profiles give the same header hash and different `LedgerCloseMeta` bytes in every ledger. With Galexie's flags, each contract event appears twice: in the operation's events and again among the diagnostic events.
- **A Soroban ledger written with diagnostic events on is not byte-reproducible.** Every call carries a `core_metrics` diagnostic event `invoke_time_nsecs`, the wall-clock time the host spent. Two nodes running Galexie's default config write different bytes for the same ledger. The corpus's normalised form zeroes that one value.
- **A Soroban fee source merged earlier in the same ledger gets no refund.** `fee_charged` is then the full declared maximum, with no refund change and no refund event (`TransactionFrame.cpp:998-1001`). A reader that computes the fee as charge minus refund, or expects a refund for every Soroban transaction, gets it wrong.

## Layout

```
schema/v1/            manifest schema (v1.1)
caps/registry.json    the 75 hazards
entries/<id>/         entry.json + one raw XDR file per variant
manifest.json         generated index
recipes/classic/      classic recipes for a bare standalone stellar-core (incl. a failure suite)
recipes/soroban/      Soroban recipes + two test contracts (kit, kit2)
recipes/flags/        emitter-flag profiles: base, galexie, bare
recipes/core-image    the stellar-core image, pinned by digest
tools/                verify.mjs, lib.mjs, compare/summarize, native/ (rs-stellar-xdr reader), coverage/ (schema walker)
conformance/          orchestrator + JS/Rust/Go testees + vectors + recorded matrix
replay/               wallet-backend replay through a mock stellar-rpc (#729, #716, #731) + recorded runs
```

## Independence and licence

XDRProof is an independent open-source project. It is not affiliated with or endorsed by the Stellar Development Foundation. Code and data are licensed under [Apache-2.0](LICENSE).
