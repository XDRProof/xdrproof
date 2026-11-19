# Layer H: Reader robustness (SDK-only) (/docs/hazards/layer-h)

Depth bombs, over-length vectors, truncated input and non-canonical encodings that an SDK must reject safely.

### H-H1: Depth bombs (nested vecs/maps past each SDK's limit)

Not in the corpus yet. Checks: conformance.

Evidence: R03 ladders

Test: API vectors (exist)

### H-H2: Over-length vectors, truncated input, trailing bytes

Not in the corpus yet. Checks: conformance.

Evidence: [rs-stellar-xdr#581](https://github.com/stellar/rs-stellar-xdr/issues/581)/#598

Test: Lane S vectors todo

### H-H3: Non-canonical bool/discriminants

Not in the corpus yet. Checks: conformance.

Evidence: [rs-stellar-xdr#622](https://github.com/stellar/rs-stellar-xdr/issues/622), [js-xdr#165](https://github.com/stellar/js-xdr/issues/165)

Test: Lane S todo

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
