# A strict-send path payment fails with TOO_FEW_OFFERS inside a fee bump on mainnet (/docs/corpus/entries/failure-path-payment-strict-send-too-few-offers-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0024, CAP-0015):

- H-C1: PathPaymentStrictSendResult.PATH_PAYMENT_STRICT_SEND_TOO_FEW_OFFERS on mainnet

## The shape

No path has enough liquidity: the inner operation fails with too_few_offers.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65146228`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.path-payment-strict-send.too-few-offers-mainnet/p29-mainnet-mined-l65146228.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,825,428 B | `74cc7d661905d3f5c35e5801c170aa36784f974186027277ffba4b3928e7f437` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The inner path payment fails with too_few_offers. | `too_few_offers` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.path-payment-strict-send.too-few-offers-mainnet` · compiled from [`catalog/failure.path-payment-strict-send.too-few-offers-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.path-payment-strict-send.too-few-offers-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.path-payment-strict-send.too-few-offers-mainnet/entry.json)
