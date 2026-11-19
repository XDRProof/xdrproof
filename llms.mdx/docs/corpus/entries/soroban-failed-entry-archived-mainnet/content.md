# A mainnet Soroban call that fails entry_archived (/docs/corpus/entries/soroban-failed-entry-archived-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0066):

- H-C6: INVOKE_HOST_FUNCTION_ENTRY_ARCHIVED

## The shape

The call needs an archived entry it did not mark for restore: INVOKE_HOST_FUNCTION_ENTRY_ARCHIVED.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65511929`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.failed-entry-archived-mainnet/p29-mainnet-mined-l65511929.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,238,984 B | `b4ec8499bcc7c0ac38e7b33a565cec2cc0e34e0607012ac0983525f36224b6aa` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The call fails with entry_archived. | `entry_archived` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `soroban.failed-entry-archived-mainnet` · compiled from [`catalog/soroban.failed-entry-archived-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/soroban.failed-entry-archived-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.failed-entry-archived-mainnet/entry.json)
