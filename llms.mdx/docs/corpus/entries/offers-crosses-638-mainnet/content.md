# One mainnet offer crosses 638 offers (/docs/corpus/entries/offers-crosses-638-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C7: one ManageSellOffer claims 638 offers

## The shape

A single MANAGE_SELL_OFFER claims 638 offers: 638 claim atoms and as many removed or updated offers.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65488299`](https://github.com/XDRProof/xdrproof/blob/main/entries/offers.crosses-638-mainnet/p29-mainnet-mined-l65488299.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,809,416 B | `e3e01f5afbd3c9f147ec15601193ec9b841a0ce84d8aa95f015e6a33ba328769` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The result holds 638 claim atoms. | length `638` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `offers.crosses-638-mainnet` · compiled from [`catalog/offers.crosses-638-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/offers.crosses-638-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/offers.crosses-638-mainnet/entry.json)
