# A mainnet validator vote updating seven Soroban settings (/docs/corpus/entries/upgrade-config-settings-vote-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046, CAP-0063):

- H-F10: mainnet LEDGER_UPGRADE_CONFIG with 7 settings

## The shape

One LEDGER_UPGRADE_CONFIG updates seven ConfigSettingEntry values, including ledger_max_dependent_tx_clusters 3.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65080525`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.config-settings-vote-mainnet/p29-mainnet-mined-l65080525.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,116,128 B | `cb1eadc528e439cacc1899963f84454884527e02a342cd6d4c7a01854aa866e7` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| ledger_max_dependent_tx_clusters becomes 3. | some change where 1 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `upgrade.config-settings-vote-mainnet` · compiled from [`catalog/upgrade.config-settings-vote-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/upgrade.config-settings-vote-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/upgrade.config-settings-vote-mainnet/entry.json)
