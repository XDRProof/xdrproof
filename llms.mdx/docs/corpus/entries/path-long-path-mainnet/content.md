# A mainnet path payment with a 5-asset path inside a fee bump (/docs/corpus/entries/path-long-path-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0024):

- H-B12: PathPaymentStrictSendOp.path at 5 on mainnet

## The shape

path<5> full on mainnet: a strict-send path payment through 5 assets, wrapped in a fee bump.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65517347`](https://github.com/XDRProof/xdrproof/blob/main/entries/path.long-path-mainnet/p29-mainnet-mined-l65517347.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,438,048 B | `f99bd72f20938ee3c6ec14e97a392a11cc326b187ea9fb486221ba5282789e94` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The path holds 5 assets. | length `5` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `path.long-path-mainnet` · compiled from [`catalog/path.long-path-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/path.long-path-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/path.long-path-mainnet/entry.json)
