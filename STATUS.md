# Status

A dated public log of what has landed in XDRProof. Newest first. Weekly updates also go to #scf-general on the
Stellar developer Discord.

## 2026-11-20

- **Submitted the SCF #46 Build application** for RFP 2.
- **Pitch film (2:58):** [youtu.be/zABwPoJ835c](https://youtu.be/zABwPoJ835c). The same film is at
  [xdrproof.dev/demo](https://xdrproof.dev/demo), where each chapter links to the page or issue that backs it.
- **Upstream:** wallet-backend#834 and js-stellar-xdr-json#67 are open and waiting on maintainers.

## 2026-11-19

- **Applied to SCF #46, RFP 2** (XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide). The interest form is under
  review.
- **Reported upstream:**
  - [stellar/wallet-backend#834](https://github.com/stellar/wallet-backend/issues/834): native balances miss Soroban
    fee refunds on protocol 20–22 ledgers. A fix is tested on a branch, replayed against the whole corpus.
  - [stellar/js-stellar-xdr-json#67](https://github.com/stellar/js-stellar-xdr-json/issues/67): the decoder refuses
    13 ledgers closed by a standalone stellar-core v30.0.0 with the raised Soroban test limits.
  - A tested bound offered on [stellar/wallet-backend#820](https://github.com/stellar/wallet-backend/issues/820).
- **Sibling sweep for #67:**
  - java-stellar-sdk 6.0.0 refuses the same 13 ledgers at its default depth of 200; they need 267 and 268. Posted as
    evidence on the maintainer's own issue,
    [lightsail-network/java-stellar-sdk#835](https://github.com/lightsail-network/java-stellar-sdk/issues/835#issuecomment-7016550020).
  - stellar-php-sdk 1.18.0 reads all 634 variants.
  - js-stellar-sdk 17.4.0, rs-stellar-xdr 30.0.0 (depth 1,500), go-stellar-sdk v0.9.0 and both Python builds read them
    (`make conformance`).
- **CI added:** `make verify`, `make novelty` and the linter self-test on every push to `main` and every pull request.
- **Added** a threat model and a security policy.
- **Wording tightened** to say exactly what was measured: the oracle finds values in stellar-core's own decoding, and a
  native reader checks their exact fields; the RFP's list is 18 sightings.

## 2026-11-18

- Public repository opened. Built stage by stage since then:
  - corpus and schema;
  - the independent readers;
  - recipes and mined ledgers;
  - 263 entries and 634 variants;
  - the SDK conformance runner;
  - the wallet-backend replay;
  - the xplint linter.
