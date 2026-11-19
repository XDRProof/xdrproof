# Concepts (/docs/start/concepts)

| Word | Meaning |
|---|---|
| **Entry** | One rare shape. A directory under `entries/` with an `entry.json` and one XDR file per variant, plus up to two alternate-ordering files when the change order varies. Its `id` is permanent and never reused. |
| **Catalog file** | The hand-written source of an entry, `catalog/<id>.json`: its intent and facts, addressed relative to the focus transaction. `make build` (`tools/build.mjs`) compiles it into the entry. |
| **Family** | The first part of an entry id, such as `failure`, `signer` or `archival`. The docs group entries by it. |
| **Variant** | One ledger file of an entry, for one protocol, one network passphrase and one emitter-flag profile. Its key reads like `p30-mainnet-generated`; a `-galexie` or `-bare` suffix names a non-base profile. |
| **Flag profile** | Which of stellar-core's six metadata flags a run sets: `base` (the shipped variants), `galexie` (all six, as public data lakes are written) or `bare` (none). The ledger is the same; the metadata is not. |
| **Lane** | How a variant was made: `generated` by a standalone stellar-core, `mined` from ledger history, or `synthetic` (hand-built; none yet). The recipes are also split into two lanes, classic and Soroban. |
| **Hazard** | A named way readers break, with its evidence, from `caps/registry.json`. For example, `H-A3` is a signed-payload signer stored as 33 bytes. |
| **Placement** | Where in the XDR a hazard sits in this entry. For example, `SetOptionsOp.signer.key`. |
| **Fact** | A value a correct reader must find at a JSON Pointer path in the SEP-0051 rendering, as `equals`, `length` or `some` (a matching change, in any order). |
| **Evidence** | What backs a fact: `construction`, `snapshot`, `core`, `walker` or `review`. |
| **SDK check** | A rule for an SDK helper rather than a value, such as "return all 5 entries or raise an error". |
| **Focus** | The transaction (and operation) the entry is about, so a reader knows where to look in a full ledger. |
| **Change order** | Whether stellar-core always emits the operation's changes in the same order. When it doesn't, the entry pins an order-normalised hash and lists every ordering seen. |
| **Channel** | `stable`, `next` (gated CAPs before mainnet) or `embargoed` (never committed publicly). All entries today are `stable`. |
