# A mainnet contract event whose data is a deeply nested ScVal (/docs/corpus/entries/event-deep-scval-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-E2: contract event data with nested maps and vectors

## The shape

A DeFi vault event carries nested maps and vectors in its data: readers with shallow ScVal handling truncate it.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65516072`](https://github.com/XDRProof/xdrproof/blob/main/entries/event.deep-scval-mainnet/p29-mainnet-mined-l65516072.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,260,816 B | `edc91f96799427ae7fb5aa96fa0591d5c522c37b15e98a15dd85c00a21522521` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| Event 5 is a contract event of the vault. | some change where 2 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `event.deep-scval-mainnet` · compiled from [`catalog/event.deep-scval-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/event.deep-scval-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/event.deep-scval-mainnet/entry.json)
