# MANAGE_SELL_OFFER fails with LOW_RESERVE on mainnet (/docs/corpus/entries/failure-manage-sell-offer-low-reserve-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: ManageSellOfferResult.MANAGE_SELL_OFFER_LOW_RESERVE on mainnet

## The shape

A new sell offer needs another 0.5 XLM of reserve the account does not have: low_reserve, no offer.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65460631`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-sell-offer.low-reserve-mainnet/p29-mainnet-mined-l65460631.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,156,180 B | `6be00191ddc9109958aa51575b0a993bd1e0c73affaedd07784dedf125bad430` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with low_reserve. | `low_reserve` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.manage-sell-offer.low-reserve-mainnet` · compiled from [`catalog/failure.manage-sell-offer.low-reserve-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.manage-sell-offer.low-reserve-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-sell-offer.low-reserve-mainnet/entry.json)
