# A protocol-12 mainnet ledger: LedgerCloseMeta v0 and only V0 envelopes (/docs/corpus/entries/backfill-p12-v0-envelopes)

Where it sits, inside `LedgerCloseMeta` (pre-cap):

- H-F8: LedgerCloseMeta v0 with TransactionEnvelope V0
- H-F9: TransactionMeta v4 at protocol 12 because of a node flag

## The shape

Before protocol 13 every envelope is ENVELOPE_TYPE_TX_V0 (raw ed25519 source, no MuxedAccount) in a classic TransactionSet, and LedgerCloseMeta is v0. In SDF's lake the TransactionMeta is v4 (Galexie's BACKFILL_STELLAR_ASSET_EVENTS).

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p12-mainnet-mined-l26588352`](https://github.com/XDRProof/xdrproof/blob/main/entries/backfill.p12-v0-envelopes/p12-mainnet-mined-l26588352.xdr.zst) | P12 | mainnet passphrase | mined from history | 887,884 B | `039ba91a4dfd229cbbc58204ce16afed91eb066f4b88219b7d1932f08359b584` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The transaction set is classic, with 532 envelopes. | length `532` | snapshot |
| The first envelope is tx_v0: its source is a raw ed25519 key (source_account_ed25519), not a MuxedAccount. | `affe49fa72ececbd83bcc480be7e6f1cf65ffb7aa2cb928065361cd9b983ab5c` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `backfill.p12-v0-envelopes` · compiled from [`catalog/backfill.p12-v0-envelopes.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/backfill.p12-v0-envelopes.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/backfill.p12-v0-envelopes/entry.json)
