# A mainnet Soroban call that fails resource_limit_exceeded inside a fee bump (/docs/corpus/entries/soroban-failed-resource-limit-exceeded-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-C6: INVOKE_HOST_FUNCTION_RESOURCE_LIMIT_EXCEEDED in a fee bump

## The shape

The inner call exceeds its declared resources: INVOKE_HOST_FUNCTION_RESOURCE_LIMIT_EXCEEDED, under txFEE_BUMP_INNER_FAILED.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65517387`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.failed-resource-limit-exceeded-mainnet/p29-mainnet-mined-l65517387.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,228,904 B | `5ca13bdb1654ae22910f921a69817d620cf67e47768b951bf50b2814ae800be8` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The inner call fails with resource_limit_exceeded. | `resource_limit_exceeded` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `soroban.failed-resource-limit-exceeded-mainnet` · compiled from [`catalog/soroban.failed-resource-limit-exceeded-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/soroban.failed-resource-limit-exceeded-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.failed-resource-limit-exceeded-mainnet/entry.json)
