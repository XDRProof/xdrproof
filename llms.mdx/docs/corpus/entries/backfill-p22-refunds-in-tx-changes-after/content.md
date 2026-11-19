# Protocol 22: the Soroban refund is in txChangesAfter (/docs/corpus/entries/backfill-p22-refunds-in-tx-changes-after)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-F8: Soroban refund in TransactionMeta.txChangesAfter (P20-22)
- H-C13: refund placement before protocol 23

## The shape

Before protocol 23 the Soroban fee refund is a change in each transaction's txChangesAfter; from 23 it moved to postTxApplyFeeProcessing. LedgerCloseMeta v1.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p22-mainnet-mined-l56085459`](https://github.com/XDRProof/xdrproof/blob/main/entries/backfill.p22-refunds-in-tx-changes-after/p22-mainnet-mined-l56085459.xdr.zst) | P22 | mainnet passphrase | mined from history | 1,713,432 B | `ba8961760204861f773dfc133c1827680a242a89b94aa49c4b4d43b5768688cb` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The refund is in tx_changes_after (2 changes). | length `2` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `backfill.p22-refunds-in-tx-changes-after` · compiled from [`catalog/backfill.p22-refunds-in-tx-changes-after.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/backfill.p22-refunds-in-tx-changes-after.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/backfill.p22-refunds-in-tx-changes-after/entry.json)
