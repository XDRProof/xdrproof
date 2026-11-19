# MANAGE_SELL_OFFER fails with LINE_FULL on testnet (/docs/corpus/entries/failure-manage-sell-offer-line-full-testnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: ManageSellOfferResult.MANAGE_SELL_OFFER_LINE_FULL on testnet

## The shape

The account could not receive what the offer buys: its trustline for the bought asset has no room left within its limit. The offer is refused although the account holds what it sells.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p30-testnet-mined-l5540313`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-sell-offer.line-full-testnet/p30-testnet-mined-l5540313.xdr.zst) | P30 | testnet passphrase | mined from history | 345,344 B | `0f2ed6010b72cc9bf9d26a5d3df522f741c580f7bc3bb6ff0913c58c1089b8e3` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with line_full. | `line_full` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.manage-sell-offer.line-full-testnet` · compiled from [`catalog/failure.manage-sell-offer.line-full-testnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.manage-sell-offer.line-full-testnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-sell-offer.line-full-testnet/entry.json)
