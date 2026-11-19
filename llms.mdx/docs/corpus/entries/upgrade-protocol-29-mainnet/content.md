# The mainnet ledger that upgraded the protocol to 29 (/docs/corpus/entries/upgrade-protocol-29-mainnet)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-F1: LEDGER_UPGRADE_VERSION 29 on mainnet

## The shape

A protocol upgrade applies at the end of a ledger: LEDGER_UPGRADE_VERSION in the header's scp_value.upgrades, and the changes it causes in upgradesProcessing. The ledger's own transactions ran under the old protocol.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l64717645`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.protocol-29-mainnet/p29-mainnet-mined-l64717645.xdr.zst) | P29 | mainnet passphrase | mined from history | 881,080 B | `78500116981ac6b094d1ee4f7afa61a5adbd04dd68d312b79e263a287a7bc2bd` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The header's ledger version is 29. | `29` | snapshot, core, walker |
| upgradesProcessing holds the version upgrade. | `[object Object]` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `upgrade.protocol-29-mainnet` · compiled from [`catalog/upgrade.protocol-29-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/upgrade.protocol-29-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.protocol-29-mainnet/entry.json)
