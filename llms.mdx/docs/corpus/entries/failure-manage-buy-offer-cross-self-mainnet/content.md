# MANAGE_BUY_OFFER fails with CROSS_SELF on mainnet (/docs/corpus/entries/failure-manage-buy-offer-cross-self-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0006):

- H-C1: ManageBuyOfferResult.MANAGE_BUY_OFFER_CROSS_SELF on mainnet

## The shape

The buy offer would cross an offer of the same account.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65024796`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-buy-offer.cross-self-mainnet/p29-mainnet-mined-l65024796.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,405,204 B | `d0baaddf24b11ace302b20fe753315686112aa22bfd6166a822c6053288d5c0c` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with cross_self. | `cross_self` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.manage-buy-offer.cross-self-mainnet` · compiled from [`catalog/failure.manage-buy-offer.cross-self-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.manage-buy-offer.cross-self-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-buy-offer.cross-self-mainnet/entry.json)
