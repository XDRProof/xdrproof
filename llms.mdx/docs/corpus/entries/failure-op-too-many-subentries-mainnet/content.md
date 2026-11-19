# An operation fails with opTOO_MANY_SUBENTRIES on mainnet (/docs/corpus/entries/failure-op-too-many-subentries-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-C1: OperationResult.opTOO_MANY_SUBENTRIES on mainnet

## The shape

The account already has the maximum 1000 subentries: the operation fails at the operation level with opTOO_MANY_SUBENTRIES, not an op-specific code.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65506631`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.op.too-many-subentries-mainnet/p29-mainnet-mined-l65506631.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,053,600 B | `87a200665048393966022983822bf42a496c293fee823daf5318a537974b2fae` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The result is txFAILED with opTOO_MANY_SUBENTRIES. | `op_too_many_subentries` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `failure.op.too-many-subentries-mainnet` · compiled from [`catalog/failure.op.too-many-subentries-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/failure.op.too-many-subentries-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/failure.op.too-many-subentries-mainnet/entry.json)
