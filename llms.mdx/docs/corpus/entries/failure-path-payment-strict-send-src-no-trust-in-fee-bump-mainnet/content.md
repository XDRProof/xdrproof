# Four path payments in a fee bump: two succeed through a liquidity pool, then NO_TRUST and SRC_NO_TRUST (/docs/corpus/entries/failure-path-payment-strict-send-src-no-trust-in-fee-bump-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0015, CAP-0038):

- H-C1: PathPaymentStrictSendResult.PATH_PAYMENT_STRICT_SEND_SRC_NO_TRUST at op 3 of a failed inner tx
- H-C2: txFEE_BUMP_INNER_FAILED whose inner results mix pool trades and two failure codes
- H-C8: liquidity-pool claim atoms in the success result of an op inside a failed transaction

## The shape

Inside a fee bump, operations 0 and 1 report success with liquidity-pool claim atoms, operation 2 fails with no_trust and operation 3 with src_no_trust (the source holds no trustline for the asset it sends). The inner transaction failed: none of the pool trades happened.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65485185`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.path-payment-strict-send.src-no-trust-in-fee-bump-mainnet/p29-mainnet-mined-l65485185.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,495,988 B | `fc6b3e4907991b6d568d0fb6096551348de8e2d062ad836b91f56b773dced1e0` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| Operation 3 fails with src_no_trust. | `src_no_trust` | snapshot, core, walker |
| Operation 2 fails with no_trust. | `no_trust` | snapshot, core, walker |
| Operation 0 reports a trade through pool LAGSLLBP…, which did not happen. | `LAGSLLBP6I6A6H52VL7ZNGOSO6PU45Z5B5SZSWVICT7ZACK4PXCFDGA3` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.path-payment-strict-send.src-no-trust-in-fee-bump-mainnet` · compiled from [`catalog/failure.path-payment-strict-send.src-no-trust-in-fee-bump-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.path-payment-strict-send.src-no-trust-in-fee-bump-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.path-payment-strict-send.src-no-trust-in-fee-bump-mainnet/entry.json)
