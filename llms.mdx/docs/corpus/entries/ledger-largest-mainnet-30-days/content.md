# The largest mainnet ledger of 30 days: 1184 transactions (/docs/corpus/entries/ledger-largest-mainnet-30-days)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-F3: mainnet ledger with 1184 transactions

## The shape

A ledger with 1184 transactions (classic and Soroban) and a 1000-operation classic cap: memory and time limits of an indexer meet real volume here.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65167655`](https://github.com/XDRProof/xdrproof/blob/main/entries/ledger.largest-mainnet-30-days/p29-mainnet-mined-l65167655.xdr.zst) | P29 | mainnet passphrase | mined from history | 5,574,024 B | `f32809fefd5a57bae750fc35120f73a364f1e9e56fd97d3f79b4af96b42b6572` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| tx_processing holds 1184 transactions. | length `1184` | snapshot |
| max_tx_set_size is 1000. | `1000` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `ledger.largest-mainnet-30-days` · compiled from [`catalog/ledger.largest-mainnet-30-days.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/ledger.largest-mainnet-30-days.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/ledger.largest-mainnet-30-days/entry.json)
