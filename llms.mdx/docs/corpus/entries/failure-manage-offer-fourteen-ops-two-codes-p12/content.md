# A failed 14-operation offer transaction with two failure codes and twelve successes that changed nothing (/docs/corpus/entries/failure-manage-offer-fourteen-ops-two-codes-p12)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: two failure codes (not_found at op 4, underfunded at op 13) in one failed tx; twelve other ops report success

## The shape

One transaction manages 14 offers. Operation 4 fails with not_found and operation 13 with underfunded; the other twelve report success, some with the offer deleted. The transaction failed, so none of it happened: the meta has no operation changes. Each operation still has its own result, including results evaluated after the first failure. Readers that take the first failing code as the only one, or that apply "success" results of a failed transaction, get both wrong.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p12-mainnet-mined-l26588352`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-offer.fourteen-ops-two-codes-p12/p12-mainnet-mined-l26588352.xdr.zst) | P12 | mainnet passphrase | mined from history | 887,884 B | `039ba91a4dfd229cbbc58204ce16afed91eb066f4b88219b7d1932f08359b584` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| Operation 4 fails with not_found. | `not_found` | snapshot, core, walker |
| Operation 13 fails with underfunded. | `underfunded` | snapshot, core, walker |
| Operation 0 reports success with its offer deleted, in the failed transaction. | `deleted` | snapshot, core, walker |
| There are 14 operation results. | length `14` | snapshot |
| No operation meta is recorded for the failed transaction. | length `0` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.manage-offer.fourteen-ops-two-codes-p12` · compiled from [`catalog/failure.manage-offer.fourteen-ops-two-codes-p12.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.manage-offer.fourteen-ops-two-codes-p12.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-offer.fourteen-ops-two-codes-p12/entry.json)
