# A failed 100-operation transaction: claimable balances fail with NO_TRUST between payments that report success (/docs/corpus/entries/failure-create-claimable-balance-no-trust-100-ops-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0023):

- H-C1: CreateClaimableBalanceResult.CREATE_CLAIMABLE_BALANCE_NO_TRUST at ops 0-6 with payments reporting success at op 7 of the same failed tx
- H-C9: claimable-balance creation that fails at apply

## The shape

A 100-operation airdrop-style transaction mixes CREATE_CLAIMABLE_BALANCE and PAYMENT. The balances fail with no_trust (the source holds no trustline for the asset) while the payments between them report success; the whole transaction failed, so no payment happened.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65514477`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.create-claimable-balance.no-trust-100-ops-mainnet/p29-mainnet-mined-l65514477.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,536,208 B | `e29beaedb0b4b1919f5ddcf0239b5a382d624cccd07a1ae4a61ffc0b6e24f868` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| Operation 0 fails with no_trust. | `no_trust` | snapshot, core, walker |
| Operation 7, a payment, reports success in the failed transaction. | `success` | snapshot, core, walker |
| There are 100 operation results. | length `100` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.create-claimable-balance.no-trust-100-ops-mainnet` · compiled from [`catalog/failure.create-claimable-balance.no-trust-100-ops-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.create-claimable-balance.no-trust-100-ops-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.create-claimable-balance.no-trust-100-ops-mainnet/entry.json)
