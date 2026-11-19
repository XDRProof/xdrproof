# CLAIM_CLAIMABLE_BALANCE fails with NO_TRUST on mainnet (/docs/corpus/entries/failure-claim-claimable-balance-no-trust-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0023):

- H-C1: ClaimClaimableBalanceResult.CLAIM_CLAIMABLE_BALANCE_NO_TRUST on mainnet
- H-C9: a claim that fails for a missing trustline

## The shape

The claimant has no trustline for the balance's asset: the claim fails and the balance stays. Readers that mark a balance claimed when they see the claim operation are wrong.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65485185`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.claim-claimable-balance.no-trust-mainnet/p29-mainnet-mined-l65485185.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,495,988 B | `fc6b3e4907991b6d568d0fb6096551348de8e2d062ad836b91f56b773dced1e0` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The claim fails with no_trust. | `no_trust` | snapshot, core, walker |
| The claimed balance is named by its B strkey. | `BAACM5XEF6PUQ3KKWQGAMNHA2G7G3E4GI4WKUYY6ICQSJI7U7GCFO5DKBY` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.claim-claimable-balance.no-trust-mainnet` · compiled from [`catalog/failure.claim-claimable-balance.no-trust-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.claim-claimable-balance.no-trust-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.claim-claimable-balance.no-trust-mainnet/entry.json)
