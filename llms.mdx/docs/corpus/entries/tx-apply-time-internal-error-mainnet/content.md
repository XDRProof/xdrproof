# A mainnet transaction that ends txINTERNAL_ERROR (/docs/corpus/entries/tx-apply-time-internal-error-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-C1: txINTERNAL_ERROR at apply, a mainnet Soroban call
- H-C13: the refund of a txINTERNAL_ERROR transaction, before protocol 23

## The shape

stellar-core threw while applying a Soroban call: the result is txINTERNAL_ERROR, the fee is charged and no operation has metadata. Before protocol 23 the unused fee still comes back, in txChangesAfter.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p22-mainnet-mined-l58357467`](https://github.com/XDRProof/xdrproof/blob/main/entries/tx.apply-time.internal-error-mainnet/p22-mainnet-mined-l58357467.xdr.zst) | P22 | mainnet passphrase | mined from history | 1,373,968 B | `7351a2d209a02bac02053437ee1acb3e36c428d6cbbe044c71fc641fe9d230ed` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| stellar-core threw while applying the transaction: the result is txINTERNAL_ERROR. | `tx_internal_error` | snapshot, core, walker |
| The fee charged, after the refund below, is 555,036 stroops. | `555036` | snapshot, core, walker |
| The metadata has no operation entries. | length `0` | snapshot |
| The unused fee comes back in txChangesAfter (2 changes), not in an operation. | length `2` | snapshot |
| Before the refund the source account holds 2,719,687,106 stroops. | `2719687106` | snapshot, core, walker |
| After it, 2,719,810,889: a refund of 123,783. | `2719810889` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `tx.apply-time.internal-error-mainnet` · compiled from [`catalog/tx.apply-time.internal-error-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/tx.apply-time.internal-error-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/tx.apply-time.internal-error-mainnet/entry.json)
