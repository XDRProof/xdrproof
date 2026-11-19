# Manifest schema (/docs/corpus/schema)

The schema is [`schema/v1/entry.schema.json`](https://github.com/XDRProof/xdrproof/blob/main/schema/v1/entry.schema.json), version 1.1. Every table on this page is generated from it.

## The RFP's fields

| RFP field | Schema |
|---|---|
| Entry ID | `id` + `variants[].key` (permanent; never reused) |
| CAP | `caps` |
| Protocol version | `variants[].protocol` |
| Source | `variants[].source`: `mined` with the lake URL and sha256, or `generated` with the core version, emitter flags and recipe |
| Synthetic flag | `variants[].synthetic` (with `emittable` when true) |
| Expected decoded values | `expected.facts` (order-independent where needed) and `expected.sdk_checks` |

Beyond those, each entry names its `hazards` (with the `placement` in the XDR), and each variant its `focus` transaction. Variants may be zstd-compressed (large mainnet ledgers); `size` and `sha256` describe the decompressed bytes.

## Entry

The entry schema: [schema/v1/entry.schema.json](https://github.com/XDRProof/xdrproof/blob/main/schema/v1/entry.schema.json).

## Variant

One ledger file of an entry: a protocol, a network passphrase, and how it was obtained.

The `variant` definition schema: [schema/v1/entry.schema.json](https://github.com/XDRProof/xdrproof/blob/main/schema/v1/entry.schema.json).

## Fact

One value a correct reader must find, at a path in the SEP-0051 JSON rendering. It is given as `equals`, `length` or `some` (a change that matches, in any order).

The `fact` definition schema: [schema/v1/entry.schema.json](https://github.com/XDRProof/xdrproof/blob/main/schema/v1/entry.schema.json).

## SDK check

A rule for an SDK helper rather than a value. For example, a native projection must keep every entry of a map or refuse it.

The `sdk_check` definition schema: [schema/v1/entry.schema.json](https://github.com/XDRProof/xdrproof/blob/main/schema/v1/entry.schema.json).
