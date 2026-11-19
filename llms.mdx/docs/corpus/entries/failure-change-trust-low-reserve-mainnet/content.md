# CHANGE_TRUST fails with LOW_RESERVE on mainnet (/docs/corpus/entries/failure-change-trust-low-reserve-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: ChangeTrustResult.CHANGE_TRUST_LOW_RESERVE on mainnet

## The shape

A trustline needs another 0.5 XLM of reserve the account does not have: the operation fails with low_reserve and the fee is charged.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65024796`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.change-trust.low-reserve-mainnet/p29-mainnet-mined-l65024796.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,405,204 B | `d0baaddf24b11ace302b20fe753315686112aa22bfd6166a822c6053288d5c0c` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation fails with low_reserve. | `low_reserve` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.change-trust.low-reserve-mainnet` · compiled from [`catalog/failure.change-trust.low-reserve-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.change-trust.low-reserve-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.change-trust.low-reserve-mainnet/entry.json)
