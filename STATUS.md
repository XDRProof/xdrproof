# Status

A dated public log of what has landed in XDRProof. Newest first. Weekly updates also go to #scf-general on the
Stellar developer Discord.

## 2026-11-25

- **The roadmap issues now show where each deliverable stands.** Issues #1 to #13 each have the facts (tranche,
  planned weeks, due date, status, owner), a diagram of how the parts fit, what ships, the parts as future sub-issues,
  "done when" in the proposal's words, what is not included, and what exists today. The diagrams are drawn by
  `tools/roadmap` from one data file.
- **A form for reporting a problem with XDRProof itself**, and a pull request template that states what changed in
  the corpus. Blank issues are off; the new-issue page links the security policy and the docs.

## 2026-11-24

- **A 264th entry, mined from mainnet: a transaction that ends `txINTERNAL_ERROR`.** stellar-core threw while applying
  a Soroban call in pubnet ledger 58357467 (protocol 22, 7 August 2025): the fee is charged and no operation has
  metadata. Searching Hubble's mainnet transactions from January 2025 (BigQuery) found only this one; the search reads
  each transaction's outer result, so one inside a fee bump would not show. It was one of the 8 shapes a standalone
  stellar-core cannot make; 7 remain. The corpus is now 264 entries and 635 variants, reaching 418 of 499 arms, and
  all six SDK builds read the new ledger.
- **wallet-backend#834 on a second mainnet ledger.** Replayed into wallet-backend `main`, ledger 58357467 ends with
  2 balances short by exactly their refunds: 10,942,591 stroops over 92 transactions, and 123,783, the failed
  transaction's own unused fee. The fix branch handles it.
- **Every command now shows what it is doing from the first second**, then ends with short result cards and one
  verdict line. This covers `make oracle`, `novelty`, `coverage-report`, `build`, `generate`, `order-scan` and the
  replay harness run on its own, joining `verify`, `conformance`, `replay`, `lint`, `lint-selftest` and `coverage`.
  The first `make oracle` now says it is downloading stellar-core (about 2 GB, once) instead of sitting silent.
- **Measured, and the stated times corrected:** `make generate` makes every generated ledger again from scratch in
  47 seconds on 10 cores (it said ~10 min), `make order-scan` 2 minutes (it said ~15 min), `make oracle` 16 seconds.
- **Every command has a real recorded run on its page** at [xdrproof.dev](https://xdrproof.dev), and so do the four
  copy-paste SDK tests: JavaScript, Go, Rust and Python each read all 634 ledgers from an empty folder.
- **Replayed the whole corpus into wallet-backend's latest `main`** (`76194899`, 20 Nov): the same verdicts as on
  `18db88f4`. 618 of 634 handled, 14 dropped by causes already reported upstream, and the 2 variants of the #834
  ledger still mishandled.
- **wallet-backend#834:** a one-file Go test, with no Docker and nothing from XDRProof, is on the issue. It fails
  on `main` and passes with the fix.
- `make conformance ARGS="--entries <id>"` runs only the named corpus entries.
- **The SDKs' main branches, checked** ([record](conformance/recorded/main-branches-2026-11-24.md)): rs-stellar-xdr main reads
  the corpus exactly as 30.0.0 and fixes rs-stellar-xdr#622 (a bool of 2), which our expectations pinned; recorded as
  fixed on main, not yet released. `make conformance` now installs what it needs on a fresh clone.
- **The roadmap is public:** three milestones (the tranches, with their dates) and one issue per deliverable,
  [#1 to #13](https://github.com/XDRProof/xdrproof/milestones), each marked *planned · starts on award*. A new issue
  form, **Suggest a ledger shape**, asks SDK and indexer maintainers which shapes have bitten them.
- **The "Reported upstream" table is now written from one list** (`findings/upstream.json`) into the README, the
  findings report, the docs and the org profile, with each report's status checked on GitHub (`make upstream-table`);
  CI fails when a copy differs. Every report has a figure now, java-stellar-sdk#835 included.

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
