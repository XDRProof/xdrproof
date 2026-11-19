# A mainnet Soroban call that fails insufficient_refundable_fee (/docs/corpus/entries/soroban-failed-insufficient-refundable-fee-mainnet)

Where it sits, inside `LedgerCloseMeta` (CAP-0046):

- H-C6: INVOKE_HOST_FUNCTION_INSUFFICIENT_REFUNDABLE_FEE

## The shape

The declared refundable fee does not cover rent and events: INVOKE_HOST_FUNCTION_INSUFFICIENT_REFUNDABLE_FEE.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p29-mainnet-mined-l65516072`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.failed-insufficient-refundable-fee-mainnet/p29-mainnet-mined-l65516072.xdr.zst) | P29 | mainnet passphrase | mined from history | 1,260,816 B | `edc91f96799427ae7fb5aa96fa0591d5c522c37b15e98a15dd85c00a21522521` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The call fails with insufficient_refundable_fee. | `insufficient_refundable_fee` | snapshot, core, walker |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `soroban.failed-insufficient-refundable-fee-mainnet` · compiled from [`catalog/soroban.failed-insufficient-refundable-fee-mainnet.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/soroban.failed-insufficient-refundable-fee-mainnet.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/soroban.failed-insufficient-refundable-fee-mainnet/entry.json)
