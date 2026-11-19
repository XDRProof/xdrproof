# MANAGE_BUY_OFFER fails with LOW_RESERVE on mainnet (/docs/corpus/entries/failure-manage-buy-offer-low-reserve-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: ManageBuyOfferResult.MANAGE_BUY_OFFER_LOW_RESERVE on mainnet

## The shape

A new offer is a subentry that needs another 0.5 XLM of reserve; the account does not have it, so the offer is not created.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65514477`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-buy-offer.low-reserve-mainnet/p29-mainnet-mined-l65514477.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,536,208 B | `e29beaedb0b4b1919f5ddcf0239b5a382d624cccd07a1ae4a61ffc0b6e24f868` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with low_reserve. | `low_reserve` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.manage-buy-offer.low-reserve-mainnet` · compiled from [`catalog/failure.manage-buy-offer.low-reserve-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.manage-buy-offer.low-reserve-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-buy-offer.low-reserve-mainnet/entry.json)
