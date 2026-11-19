# A mainnet Soroban call carrying many authorization entries (/docs/corpus/entries/auth-many-entries-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-A7: many SorobanAuthorizationEntry addresses in one transaction

## The shape

One batch call carries many auth entries, each naming an address: an indexer that adds every auth address to that address's history puts this transaction into many unrelated histories.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65167655`](https://github.com/XDRProof/xdrproof/blob/main/entries/auth.many-entries-mainnet/p29-mainnet-mined-l65167655.xdr.zst) | P29 | mainnet passphrase | mined from history | 5,574,024 B | `f32809fefd5a57bae750fc35120f73a364f1e9e56fd97d3f79b4af96b42b6572` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The call is batch_plant. | `batch_plant` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `auth.many-entries-mainnet` · compiled from [`catalog/auth.many-entries-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/auth.many-entries-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/auth.many-entries-mainnet/entry.json)
