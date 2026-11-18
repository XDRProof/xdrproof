# Emitter-flag profiles

The same ledger is written differently depending on six stellar-core flags that only change
`LedgerCloseMeta`, never the ledger itself (hazard H-F9). Every run picks one profile with `FLAGS=<profile>`.

| Profile | Flags set to true | Who runs this way |
|---|---|---|
| `base` (default) | `EMIT_CLASSIC_EVENTS`, `EMIT_SOROBAN_TRANSACTION_META_EXT_V1`, `EMIT_LEDGER_CLOSE_META_EXT_V1` | the corpus's default variants |
| `galexie` | all six: the three above plus `BACKFILL_STELLAR_ASSET_EVENTS`, `BACKFILL_RESTORE_META`, `ENABLE_SOROBAN_DIAGNOSTIC_EVENTS` | Galexie's default captive-core config, which public data lakes are written with |
| `bare` | none | a node on stellar-core's example config |

Variant keys carry the profile as a suffix when it is not `base` (`p30-mainnet-generated-galexie`).
