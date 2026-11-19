# A protocol-30 header with a signed millisecond close time (/docs/corpus/entries/header-signed-ms)

Where it sits, inside `LedgerCloseMeta` (CAP-0088):

- H-F2: StellarValue.ext STELLAR_VALUE_SIGNED_MS

## The shape

CAP-0088: StellarValue ext signed_ms carries close_time_ms, signed by the node. Readers that read close_time only, or expect ext basic/signed, miss the new arm.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p30-testnet-mined-l5540314`](https://github.com/XDRProof/xdrproof/blob/main/entries/header.signed-ms/p30-testnet-mined-l5540314.xdr.zst) | P30 | testnet passphrase | mined from history | 168,364 B | `ee742912551436ce338747a1428c5917c589dbeaa415000f8de768493c82bb71` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| close_time_ms is close_time × 1000 here: 1793725210000. | `1793725210000` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `header.signed-ms` · compiled from [`catalog/header.signed-ms.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/header.signed-ms.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/header.signed-ms/entry.json)
