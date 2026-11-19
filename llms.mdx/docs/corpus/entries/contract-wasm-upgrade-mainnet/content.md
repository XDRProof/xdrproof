# A mainnet contract upgrades its Wasm: an executable_update system event (/docs/corpus/entries/contract-wasm-upgrade-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-D5: contract Wasm upgrade (executable_update system event)

## The shape

A contract replaces its own code; the only trace is a system event executable_update with old and new executables. Readers that index contract code only at deploy keep the old Wasm.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65514477`](https://github.com/XDRProof/xdrproof/blob/main/entries/contract.wasm-upgrade-mainnet/p29-mainnet-mined-l65514477.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,536,208 B | `e29beaedb0b4b1919f5ddcf0239b5a382d624cccd07a1ae4a61ffc0b6e24f868` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The operation emits an executable_update system event. | some change where 2 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `contract.wasm-upgrade-mainnet` · compiled from [`catalog/contract.wasm-upgrade-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/contract.wasm-upgrade-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/contract.wasm-upgrade-mainnet/entry.json)
