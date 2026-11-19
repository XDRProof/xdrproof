# Recipes (/docs/corpus/recipes)

**What it is.** Small scripts that make a private, offline stellar-core produce each rare shape on demand.

**Why it matters.** A shape you can rebuild from scratch is one anyone can verify, and one that can be made again when the protocol changes.

A recipe is a Node script (using `@stellar/stellar-sdk` 17.4.0) that drives one fresh **standalone stellar-core** over its HTTP port:

- **Fixed seeds.** Every keypair is `sha256('xdrproof:' + name)`; the root account comes from the passphrase.
- **Fixed time.** Ledger n closes at `1767225600 + n × 30 days`.
- **No RPC, no simulation.** Transactions go straight to core's `tx` endpoint, and ledgers close with `manualclose`.
- **Ledger 2 is always the protocol upgrade,** and never an entry.

Core's metadata stream is split into one `ledger-NNN.xdr` file per ledger, plus `SHA256SUMS`. An entry is one of those ledgers, chosen because it holds a rare shape.

## The two recipe sets

| Set | Script | Ledgers | What it covers |
|---|---|---|---|
| Classic | `recipes/classic/gen.mjs` | 3–105, at protocol 30 | Basics (the signed-payload signers at ledger 6), a catalogue of operations, two failure suites, blueprint placements, maximum-length vectors, a revocation cascade, surge pricing, and a final base-fee, set-size and ledger-flags upgrade |
| Soroban | `recipes/soroban/gen/gen.mjs` | 3–94 at P30 | Blueprint placements, apply-time failures, fee-bump inner failures, forged and V2-rendered auth signatures, two test contracts, delegated custom accounts, external-ref executables, config upgrades, frozen keys, eviction and automatic restore |

Entries are compiled from recipe steps (and mined ledgers) by the [catalog](/docs/corpus/catalog): 263 so far. The [hazard registry](/docs/hazards) references recipe ledgers by number.

## The test contracts

| Contract | SDK | What it does |
|---|---|---|
| `xdrproof-kit` | soroban-sdk 25.3.0 | `put(k, v)` stores a value, emits it and returns it; `nest` builds authorization trees of any depth |
| `xdrproof-kit2` | soroban-sdk 28.0.0 | A constructor, persistent, temporary and instance storage, CAP-0085 executable references, and a `__check_auth` that delegates (CAP-0071) |

Both ship as prebuilt Wasm next to their source.

## How they are run

Each run starts the `stellar/quickstart` image pinned by digest in `recipes/core-image`, and refuses anything but stellar-core v30.0.0. The core config sets manual close, a fixed node seed, and one **emitter-flag profile** from `recipes/flags/`:

| Profile | Flags set | Who runs this way |
|---|---|---|
| `base` | `EMIT_CLASSIC_EVENTS`, `EMIT_SOROBAN_TRANSACTION_META_EXT_V1`, `EMIT_LEDGER_CLOSE_META_EXT_V1` | the corpus's shipped variants |
| `galexie` | all six: the three above plus `BACKFILL_STELLAR_ASSET_EVENTS`, `BACKFILL_RESTORE_META`, `ENABLE_SOROBAN_DIAGNOSTIC_EVENTS` | Galexie's default config, which public data lakes are written with |
| `bare` | none | a node on stellar-core's example config |

Soroban runs also set `TESTING_SOROBAN_HIGH_LIMIT_OVERRIDE`. Variant keys carry the profile as a suffix when it is not `base`.

`make generate` runs 10 configurations twice each: classic P30 on both passphrases, Soroban P30 and P28 on both passphrases, and the galexie and bare profiles at P30 mainnet for each lane. It checks that every shipped generated variant is reproduced. See [Generate](/docs/tools/generate).
