# A mainnet contract trap whose diagnostic events carry a Wasm VM error (/docs/corpus/entries/soroban-diagnostic-wasm-vm-error-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-C6: Soroban trap with SCE_WASM_VM in diagnostic events

## The shape

The call traps inside the Wasm VM; the lake's diagnostic events name the SCError type wasm_vm.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65517506`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.diagnostic-wasm-vm-error-mainnet/p29-mainnet-mined-l65517506.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,646,740 B | `5ff88af6a5144d9253ea6e96ea209e7f0559a541de2b1d1141365dc9330be260` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The call traps. | `trapped` | snapshot, core, walker |
| A diagnostic event names the error: SCError type wasm_vm, code invalid_action. | some change where 1 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `soroban.diagnostic-wasm-vm-error-mainnet` · compiled from [`catalog/soroban.diagnostic-wasm-vm-error-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/soroban.diagnostic-wasm-vm-error-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.diagnostic-wasm-vm-error-mainnet/entry.json)
