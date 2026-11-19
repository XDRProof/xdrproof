# The testnet ledger that upgraded the protocol to 30 (/docs/corpus/entries/upgrade-protocol-30-testnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0088):

- H-F1: LEDGER_UPGRADE_VERSION 30 on testnet

## The shape

LEDGER_UPGRADE_VERSION 30 on testnet, written by a Galexie node.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p30-testnet-mined-l5540313`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.protocol-30-testnet/p30-testnet-mined-l5540313.xdr.zst) | P30 | testnet passphrase | mined from history | 345,344 B | `0f2ed6010b72cc9bf9d26a5d3df522f741c580f7bc3bb6ff0913c58c1089b8e3` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| upgradesProcessing holds the version 30 upgrade. | `[object Object]` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `upgrade.protocol-30-testnet` · compiled from [`catalog/upgrade.protocol-30-testnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/upgrade.protocol-30-testnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.protocol-30-testnet/entry.json)
