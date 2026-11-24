# The SDKs' main branches, 24 Nov 2026

A dated run of `make conformance` against unreleased code, to see what the next releases change. The released builds
in `conformance/expectations/` are the latest of each SDK on this date: js-stellar-sdk 17.4.0, stellar-xdr-json 30.0.0,
rs-stellar-xdr 30.0.0, go-stellar-sdk v0.9.0, py-stellar-base 17.0.1, stellar-xdr (Python) 0.2.1.

Since those releases, two main branches changed how XDR is read; the others did not (js-stellar-sdk: RPC and bindings
only; go-stellar-sdk: dependencies, CI and RPC; js-stellar-xdr-json: no commits). Both were built from main with the
expectations of their released versions. rs-stellar-xdr ran through the whole corpus and every vector; py-stellar-base
could not start, so its main is not compared:

| SDK | Commit | Result |
|---|---|---|
| rs-stellar-xdr | [`82fc818f`](https://github.com/stellar/rs-stellar-xdr/commit/82fc818fd1ba5aa978eafbfb33729e5462fe4ee9) (10 commits after 30.0.0) | All 634 corpus ledgers read exactly as with 30.0.0 (2,536 checks), all 164 strkeys and every depth vector. One change: `lane-s/bool-word-2` now **passes**. A bool encoded as 2 was read as false; main rejects it, as [#644](https://github.com/stellar/rs-stellar-xdr/pull/644) intends. That fixes [rs-stellar-xdr#622](https://github.com/stellar/rs-stellar-xdr/issues/622), which the expectations pin as a known failure of 30.0.0; it is recorded as fixed on main, not yet released. |
| py-stellar-base | [`db33c20a`](https://github.com/StellarCN/py-stellar-base/commit/db33c20abce29f9293108d5227e8bd7c30abccd8) (29 commits after 17.0.1) | Not compared: main removes `stellar_sdk.strkey.StrKey` (strkeys move to the `stellar-strkey` package), which the Python testee imports, so the testee stops at start-up. Its XDR now comes from `stellar-xdr`, which conformance already runs as `python-xdr@0.2.1` (all 634 ledgers read). The testee is updated when the release ships. |

How it was run: a separate checkout with `conformance/testees/rust` pointed at the commit above (`Cargo.toml`, git
dependency) and the Python testee's image built from the commit above, then
`make conformance ARGS="--only rust@30.0.0,python@17.0.1 --fresh"`. Nothing in the repository's expectations changed
except the record of #622.
