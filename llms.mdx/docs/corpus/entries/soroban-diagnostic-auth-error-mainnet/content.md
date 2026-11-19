# A mainnet Soroban failure whose diagnostic events carry an auth error (/docs/corpus/entries/soroban-diagnostic-auth-error-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-C6: Soroban failure with SCE_AUTH in diagnostic events
- H-E3: diagnostic events kept in the public lake

## The shape

The lake keeps diagnostic events (Galexie's flags): this failed call reports SCError type auth, the class of error behind it.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65024796`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.diagnostic-auth-error-mainnet/p29-mainnet-mined-l65024796.xdr.zst) | P29 | mainnet passphrase | mined from history | 2,405,204 B | `d0baaddf24b11ace302b20fe753315686112aa22bfd6166a822c6053288d5c0c` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| A diagnostic event carries an auth error. | some change where 1 fields match | snapshot, core, walker |
| A diagnostic event names the error: SCError type auth, code existing_value. | some change where 1 fields match | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `soroban.diagnostic-auth-error-mainnet` · compiled from [`catalog/soroban.diagnostic-auth-error-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/soroban.diagnostic-auth-error-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.diagnostic-auth-error-mainnet/entry.json)
