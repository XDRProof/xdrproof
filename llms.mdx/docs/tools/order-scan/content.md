# Order scan (/docs/tools/order-scan)

**What it is.** A measurement of how often stellar-core writes the same ledger's changes in a different order.

**Why it matters.** Code that assumes a fixed order works on one run and breaks on the next. The corpus ships the rarer orderings, so that code fails in a test instead.

```bash
make order-scan   # 20 runs per lane, classic then Soroban (~15 min)
```

stellar-core iterates a hash map with a per-process random salt, so the changes within an operation can come out in a different order on every run. The order scan measures this. It runs each recipe lane 20 times on fresh cores, records every byte ordering seen per ledger, and fails if any ledger's **content** differs once order is normalised.

## The committed results

Results are in `recipes/classic/order-scan/p30-mainnet-base.json` and `recipes/soroban/order-scan/p30-mainnet-base.json`:

| Lane | Runs | Ledgers that vary in order | Content that varies |
|---|---|---|---|
| Classic | 20 | 33 of 103 recipe ledgers; 12, 14, 78, 80, 84 differ in every run | 0 |
| Soroban | 20 | 16 of 92 recipe ledgers | 0 |

The protocol-upgrade ledger (2) varies in both lanes as well; it is never an entry.

Corpus entries whose order varies pin an order-normalised hash, and list every raw ordering seen (`change_order` in the [schema](/docs/corpus/schema)).

<Callout type="warn" title="For indexers">Never depend on the order of changes within an operation.</Callout>
