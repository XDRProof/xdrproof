# Catalog

One hand-written file per corpus entry: what the entry is for, which recipe step or mined ledger holds it, and
the facts a correct reader must find, written relative to the transaction the entry is about. `make build`
(`tools/build.mjs`) compiles the catalog into `entries/<id>/` for every variant: it copies the ledger bytes from
a fresh `make generate` run (or from `mined/`), finds the focus transaction, resolves every relative fact into
an exact JSON Pointer for that variant, and records size, sha256, provenance and change-order data. `make
verify` and `make oracle` then check the built entries; nothing in `entries/` is edited by hand.

## File: `catalog/<id>.json`

```jsonc
{
  "id": "tx.apply-time.bad-seq",                 // permanent; never reused
  "title": "...", "pattern": "...",              // what it is; why readers break
  "caps": ["CAP-0021"],
  "hazards": [{ "id": "H-C16", "placement": "TransactionResult.txBAD_SEQ of a Soroban tx in a closed ledger" }],
  "sightings": [],                                // upstream issues it reproduces
  "source": {
    "lane": "soroban",                            // classic | soroban | mined
    "step": "race-victim-txBAD_SEQ",              // recipe step name (manifest.steps[].name); for mined: the record id
    "variants": ["p30-mainnet", "p28-mainnet", "p30-testnet"],  // <p><proto>-<net>[-<flags>]; runs of make generate
    "ledger_offset": 10,                          // optional: the entry is about the ledger N after the step (focus: ledger)
    "mined": [{ "record": "signed-payload-signer@testnet-4437357", "key": "p28-testnet-mined", "tx_hash": "d9f7…" }]
                                                  // optional: mined variants beside generated ones, each naming its focus tx
  },
  "focus": { "op_index": 0 },                     // or { "ledger": true } when the entry is about the ledger itself;
                                                  // a mined entry states { "tx_hash": … } (the build never picks one)
  "facts": [
    { "says": "...", "at": "tx.result", "path": "", "equals": "tx_bad_seq", "evidence": ["construction"] }
  ]
}
```

## Fact addresses (`at`), resolved per variant

| `at` | Resolves to |
|---|---|
| `tx.result` | `/<arm>/tx_processing/<i>/result/result/result` of the focus transaction |
| `tx.result_pair` | `/<arm>/tx_processing/<i>/result` |
| `tx.fee_charged` | `/<arm>/tx_processing/<i>/result/result/fee_charged` |
| `tx.envelope` | the focus transaction's envelope in the transaction set (any phase, stage or cluster) |
| `tx.meta` | `/<arm>/tx_processing/<i>/tx_apply_processing/<tx meta arm>` |
| `tx.fee_processing`, `tx.post_apply_fee` | the fee and post-apply fee changes of the focus transaction |
| `op.meta`, `op.changes`, `op.events` | the focus operation (`focus.op_index`) in `tx.meta` |
| `ledger` | `/<arm>` (header, upgrades, evicted keys, the whole ledger) |

`path` is a JSON Pointer suffix below the address. A value may be `{"$manifest": "contracts.kit2.CA1"}`: it is
read from the run's `manifest.json`, so facts hold on every network although contract IDs differ by passphrase.
`equals`, `length` and `some` mean what they mean in the schema. Evidence labels: `construction` (the recipe
built that value), `snapshot` (the rendering by the pinned stellar-xdr crate), `review`; `core` and `walker`
are written by `make oracle` after the independent readers confirm the value.
