# A trapped mainnet call whose diagnostic events carry the contract's own error code (/docs/corpus/entries/soroban-contract-error-code-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-C6: SCError.SCE_CONTRACT: the contract's own error code 2006 in the diagnostic events of a trapped call

## The shape

The contract fails with its own error (SCError type contract, code 2006). The result only says trapped; the code lives in the diagnostic events SDF's lake keeps. Readers that decode SCError as a fixed set of host error types, or that only read the result, lose the contract's reason.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65167655`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.contract-error-code-mainnet/p29-mainnet-mined-l65167655.xdr.zst) | P29 | mainnet passphrase | mined from history | 5,574,024 B | `f32809fefd5a57bae750fc35120f73a364f1e9e56fd97d3f79b4af96b42b6572` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The call traps. | `trapped` | snapshot, core, walker |
| A diagnostic event carries contract error 2006. | some change where 2 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `soroban.contract-error-code-mainnet` · compiled from [`catalog/soroban.contract-error-code-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/soroban.contract-error-code-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.contract-error-code-mainnet/entry.json)
