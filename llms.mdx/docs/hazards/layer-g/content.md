# Layer G: Protocol and network variants (/docs/hazards/layer-g)

Bytes that depend on the network passphrase, older protocols, mainnet-only code paths in core, and CAPs gated before mainnet.

### H-G1: Passphrase-dependent bytes (hashes, contract IDs, signatures)

In the corpus. Checks: conformance, verify facts.

Evidence: F4; R01

Test: p30-mainnet and p30-testnet for every generated entry

### H-G2: Older protocol a pre-fix indexer can decode

In the corpus. Checks: replay probe.

Evidence: R02

Test: P28 runs of the Soroban lane are part of make generate; sighting entries get P28 variants in B4

### H-G3: Mainnet-only code paths in core (`gIsProductionNetwork`)

Not in the corpus yet. Checks: guide.

Evidence: `gaps-and-risks` §3.3: P24 key filter, P15→16 offer fix, P24 hot-archive fix, one historical offer

Test: Documented: none reachable by a standalone P30 generator; mined mainnet entries (planned) will cover real-network behaviour

### H-G4: Gated CAPs before mainnet (`next/`)

Not in the corpus yet. Checks: verify facts.

Evidence: [stellar-xdr#317](https://github.com/stellar/stellar-xdr/issues/317); CAP-0084 slipped P28→P30

Test: `next/` channel per upgrade

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
