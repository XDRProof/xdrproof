# A mainnet Soroban phase with three stages and two clusters in one stage (/docs/corpus/entries/parallel-three-stages-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0063):

- H-F5: ParallelTxsComponent with 3 stages, one holding 2 clusters

## The shape

CAP-0063 parallel execution: the Soroban phase is stages of clusters of transactions. This mainnet ledger has 3 stages with 1, 2 and 1 clusters. Readers that assume one stage and one cluster drop transactions.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65485185`](https://github.com/XDRProof/xdrproof/blob/main/entries/parallel.three-stages-mainnet/p29-mainnet-mined-l65485185.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,495,988 B | `fc6b3e4907991b6d568d0fb6096551348de8e2d062ad836b91f56b773dced1e0` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The Soroban phase has 3 stages. | length `3` | snapshot |
| The second stage has 2 clusters. | length `2` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `parallel.three-stages-mainnet` · compiled from [`catalog/parallel.three-stages-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/parallel.three-stages-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/parallel.three-stages-mainnet/entry.json)
