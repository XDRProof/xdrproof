# MANAGE_BUY_OFFER fails with BUY_NOT_AUTHORIZED (protocol 22, mainnet) (/docs/corpus/entries/failure-manage-buy-offer-buy-not-authorized-p22)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: ManageBuyOfferResult.MANAGE_BUY_OFFER_BUY_NOT_AUTHORIZED on mainnet
- H-C10: an offer refused because the buying trustline is not authorized

## The shape

The offer would buy an asset whose issuer has not authorized the account's trustline: buy_not_authorized. Readers that assume a trustline is usable once it exists miss the authorization flags.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p22-mainnet-mined-l56085459`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-buy-offer.buy-not-authorized-p22/p22-mainnet-mined-l56085459.xdr.zst) | P22 | mainnet passphrase | mined from history | 1,713,432 B | `ba8961760204861f773dfc133c1827680a242a89b94aa49c4b4d43b5768688cb` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with buy_not_authorized. | `buy_not_authorized` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.manage-buy-offer.buy-not-authorized-p22` · compiled from [`catalog/failure.manage-buy-offer.buy-not-authorized-p22.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.manage-buy-offer.buy-not-authorized-p22.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.manage-buy-offer.buy-not-authorized-p22/entry.json)
