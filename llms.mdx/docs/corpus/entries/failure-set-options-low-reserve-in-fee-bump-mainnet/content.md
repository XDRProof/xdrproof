# SET_OPTIONS fails with LOW_RESERVE inside a sponsorship sandwich in a fee bump, on mainnet (/docs/corpus/entries/failure-set-options-low-reserve-in-fee-bump-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap, CAP-0015, CAP-0033):

- H-C1: SetOptionsResult.SET_OPTIONS_LOW_RESERVE at op index 2; the other ops report success in a failed tx
- H-C2: txFEE_BUMP_INNER_FAILED with a four-op inner result on mainnet
- H-C3: sponsorship sandwich whose sponsored signer add fails for the sponsor's reserve

## The shape

A fee bump whose inner transaction is a sponsorship sandwich: begin sponsoring, remove one signer, add another, end sponsoring. The sponsor lacks the reserve for the new signer, so operation 2 fails with low_reserve and the whole inner transaction fails (txFEE_BUMP_INNER_FAILED). The inner result still lists every operation's code: the three others report success, although none of their effects were kept.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65024796`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.set-options.low-reserve-in-fee-bump-mainnet/p29-mainnet-mined-l65024796.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,405,204 B | `d0baaddf24b11ace302b20fe753315686112aa22bfd6166a822c6053288d5c0c` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The inner SET_OPTIONS at op index 2 fails with low_reserve. | `low_reserve` | snapshot, core, walker |
| Op 0 (begin sponsoring) still reports success in the failed inner transaction. | `success` | snapshot, core, walker |
| The failing op adds a signer with weight 20. | `20` | snapshot, core, walker |
| The inner result has four operation results. | length `4` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.set-options.low-reserve-in-fee-bump-mainnet` · compiled from [`catalog/failure.set-options.low-reserve-in-fee-bump-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.set-options.low-reserve-in-fee-bump-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.set-options.low-reserve-in-fee-bump-mainnet/entry.json)
