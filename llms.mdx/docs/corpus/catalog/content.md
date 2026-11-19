# Catalog (/docs/corpus/catalog)

**What it is.** The hand-written source of every entry: what it is for, where its ledger comes from, and the facts to check. A compiler turns it into the entry.

**Why it matters.** Nobody edits the corpus by hand, and the compiler refuses any fact that doesn't hold, so a typo can't become a wrong answer.

Nobody edits `entries/` by hand. Each entry starts as a **catalog file**, `catalog/<id>.json`. It says what the entry is for, where its ledger comes from, and the facts a correct reader must find, written relative to the transaction the entry is about. The compiler, `tools/build.mjs`, turns it into `entries/<id>/` for every variant.

<Steps>
<Step>

### Write the intent

A catalog file carries:
- the id, title and pattern;
- the CAPs, and the hazards with their placement;
- the source: a recipe lane and step, or a mined ledger;
- the variants to build, such as `p30-mainnet`, `p28-testnet` or `p30-mainnet-galexie`, and optionally mined variants beside the generated ones;
- the focus: an operation of the step's transaction, or `{"ledger": true}` when the entry is about the ledger itself. A mined entry names its transaction by hash; the compiler never picks one;
- the facts.

</Step>
<Step>

### Compile it

```bash
make build                     # every catalog file (minutes)
node tools/build.mjs [id ...]  # only these entries
```

The compiler takes the ledger bytes from a fresh [`make generate`](/docs/tools/generate) run (or from [`mined/`](/docs/corpus/mined)) and finds the focus transaction. It resolves every fact into an exact JSON Pointer for that variant, and records size, sha256, provenance and change-order data. It needs the runs of `make generate`, for the base P30 mainnet variants also those of [`make order-scan`](/docs/tools/order-scan) (it ships the most frequent byte ordering), and the native reader (`make native`). A fact that doesn't hold fails the build, and so does a variant whose focus doesn't match the catalog's (a transaction where the catalog says ledger, or none where it names one): intent and outcome must agree before an entry exists.

</Step>
<Step>

### Check it

[`make verify`](/docs/tools/verify) and [`make oracle`](/docs/tools/oracle) check the built entries like any other. [`make novelty`](/docs/tools/novelty) then fails if the new entry adds nothing another entry doesn't already hold.

</Step>
</Steps>

## Fact addresses

A fact names where it looks with `at`. The compiler resolves that address per variant, so one catalog file serves every protocol, network and flag profile.

| `at` | Resolves to |
|---|---|
| `tx.result` | the focus transaction's result |
| `tx.result_pair` | the result pair (hash and result) |
| `tx.fee_charged` | the fee charged |
| `tx.envelope` | the envelope in the transaction set, in any phase, stage or cluster |
| `tx.meta` | the transaction's meta |
| `tx.fee_processing`, `tx.post_apply_fee` | the fee and post-apply fee changes |
| `op.meta`, `op.changes`, `op.events` | the focus operation inside the meta |
| `ledger` | the whole ledger: header, upgrades, evicted keys |

A value may be `{"$manifest": "contracts.kit2.CA1"}`. It is then read from the run's own manifest, so a fact holds on every network even though contract ids differ by passphrase.

<Callout title="Authoring aid">`node tools/inspect.mjs <lane> <step> [variant]` reads a `make generate` run and prints the focus transaction's result and fee, and for each operation the kinds of its changes and its events.</Callout>
