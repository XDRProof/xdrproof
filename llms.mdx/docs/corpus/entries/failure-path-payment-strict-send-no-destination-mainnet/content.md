# A strict-send path payment to an account that does not exist, on mainnet (/docs/corpus/entries/failure-path-payment-strict-send-no-destination-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0024):

- H-C1: PathPaymentStrictSendResult.PATH_PAYMENT_STRICT_SEND_NO_DESTINATION on mainnet

## The shape

The destination account is missing: no_destination.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65517499`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.path-payment-strict-send.no-destination-mainnet/p29-mainnet-mined-l65517499.xdr.zst) | P29 | mainnet passphrase | mined from history | 920,988 B | `1addcc8a84484f04e361fba105812c3df18dbd8c762eb672691a605f88726113` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with no_destination. | `no_destination` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.path-payment-strict-send.no-destination-mainnet` · compiled from [`catalog/failure.path-payment-strict-send.no-destination-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.path-payment-strict-send.no-destination-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.path-payment-strict-send.no-destination-mainnet/entry.json)
