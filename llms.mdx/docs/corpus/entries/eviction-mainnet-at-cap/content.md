# Mainnet evicts 1000 entries in one ledger, the per-ledger cap (/docs/corpus/entries/eviction-mainnet-at-cap)

Where it sits, inside `LedgerCloseMeta` (CAP-0062):

- H-D6: evicted_keys at maxEntriesToArchive on mainnet

## The shape

1000 contract-data entries and their 1000 TTL keys leave the live state with no transaction: exactly maxEntriesToArchive, 1000 on mainnet since ledger 59516381.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65460631`](https://github.com/XDRProof/xdrproof/blob/main/entries/eviction.mainnet-at-cap/p29-mainnet-mined-l65460631.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,156,180 B | `6be00191ddc9109958aa51575b0a993bd1e0c73affaedd07784dedf125bad430` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| 2000 keys are evicted. | length `2000` | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `eviction.mainnet-at-cap` · compiled from [`catalog/eviction.mainnet-at-cap.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/eviction.mainnet-at-cap.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/eviction.mainnet-at-cap/entry.json)
