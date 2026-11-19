# Mainnet freezes a fourth account (CAP-0077) (/docs/corpus/entries/upgrade-frozen-keys-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0077):

- H-D12: mainnet frozen-key list 3 -> 4 accounts
- H-F10: LEDGER_UPGRADE_CONFIG frozen_ledger_keys on mainnet

## The shape

A mainnet config upgrade grows the frozen-key list from 3 to 4 accounts; it is visible only in upgradesProcessing as encoded LedgerKeys.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65273932`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.frozen-keys-mainnet/p29-mainnet-mined-l65273932.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,276,284 B | `c0b22acfabfbe0ff4e068abc603bc3239713aab6956db637d4912bfe0ddf8f06` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| After the upgrade 4 keys are frozen. | some change where 1 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `upgrade.frozen-keys-mainnet` · compiled from [`catalog/upgrade.frozen-keys-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/upgrade.frozen-keys-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.frozen-keys-mainnet/entry.json)
