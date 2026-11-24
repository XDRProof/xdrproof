# Mined ledgers

Real mainnet and testnet `LedgerCloseMeta`, fetched from SDF's public data lake
(`https://aws-public-blockchain.s3.amazonaws.com/v1.1/stellar/ledgers/`), for shapes that a standalone
generator cannot produce or that are worth having as real network bytes: eviction at the per-ledger cap,
validator settings votes, a mainnet freeze of ledger keys (CAP-0077), protocol-12 V0 envelopes, protocol-22
refunds, multi-stage parallel Soroban phases, a mainnet transaction that ends `txINTERNAL_ERROR`, and the ledgers
behind the upstream sightings.

- `ledgers/<network>-<seq>.lcm.xdr.zst`: one file per distinct ledger, zstd-compressed. The `sha256` and
  `size_bytes` in the index describe the decompressed `LedgerCloseMeta` (the lake object minus its 12-byte
  `LedgerCloseMetaBatch` header).
- `index.json`: one record per shape found in a ledger, with the lake URL, the lake object's metadata (the
  stellar-core version that wrote it), how the ledger was located, the findings with exact SEP-0051 JSON paths,
  and why readers break on it.
- `queries/`: the BigQuery SQL (the public `crypto-stellar.crypto_stellar` Hubble dataset) used to locate them.

`make verify` runs `tools/mined-verify.mjs`: every file must match its hash, round-trip byte for byte through
native rs-stellar-xdr, carry the recorded sequence and protocol, and every finding's transaction and JSON path
must be present. `make coverage` reports the union arms these ledgers reach.

These are network data, written by SDF's Galexie with its default flags; see the README's note on
TransactionMeta v4 in the lake.
