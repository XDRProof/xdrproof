# Conformance (/docs/tools/conformance)

```bash
make conformance     # conformance/run.sh: about 2 minutes once the builds are cached
```

Needs Node ≥ 22.15, Rust and Docker. Every SDK build answers the same questions about the same bytes, and the run prints one matrix: which SDK reads which ledger correctly.

## The builds

Each build runs as a **testee**: a small process that reads one JSON request per line on stdin and answers one JSON line on stdout. The runner (`conformance/run.mjs`) judges every answer against a reference and against that build's pre-registered expectations.

| Testee | Package | Families |
|---|---|---|
| `js@17.4.0` | `@stellar/stellar-sdk` 17.4.0 (its XDR layer is `@stellar/js-xdr` 5, written in JavaScript) | all |
| `xdr-json@30.0.0` | `@stellar/stellar-xdr-json` 30.0.0, rs-stellar-xdr compiled to WASM | corpus, lane S, depth |
| `rust@30.0.0` | `stellar-xdr` 30.0.0 with `stellar-strkey` 1.0.0 | all but the native projection |
| `go@v0.9.0` | `github.com/stellar/go-stellar-sdk` v0.9.0 | all but SEP-0051 JSON and the native projection |
| `python@17.0.1` | `stellar-sdk` 17.0.1 (py-stellar-base), the current release | all |
| `python-xdr@0.2.1` | `stellar-xdr` 0.2.1 and `stellar-strkey` 0.2.0, which py-stellar-base's next major release is built on | corpus, strkey, lane S, depth |
| `js@17.2.0` · `js@17.2.1` · `js@17.3.0` · `go@v0.7.1` · `go@v0.7.2` | the releases before and after upstream fixes | sightings |

Java, Swift, Dart, PHP and .NET SDKs can join by implementing the same protocol: `hello`, `decode`, `encode_json`, `strkey_decode` and `native`. A testee answers `unsupported` for anything its SDK cannot do, and that is recorded as not applicable, not as a failure.

## What each family checks

| Family | Input | Passes when |
|---|---|---|
| `corpus` | every variant of every entry | it decodes; the re-encoding is byte-identical; where the SDK renders SEP-0051 JSON, the JSON equals rs-stellar-xdr's and every expected fact of the entry holds on it |
| `strkey` | the SEP-0023 test vectors, plus a deterministic sample of every kind of address in the corpus | valid keys decode to the right kind and payload; invalid keys are rejected |
| `lane-s` | hand-built invalid XDR: truncated, trailing bytes, a bool of 2, unknown and negative discriminants, a symbol past its maximum, non-zero padding, an optional flag of 2, a huge length with no data, a path longer than five | every invalid input is rejected; the valid controls are accepted |
| `depth` | an `ScVal` vector nested 64 to 4,000 deep | measured: the deepest value each SDK decodes, and whether anything crashes |
| `sdk-check` | each entry's `expected.sdk_checks` | the helper behaves as the check says, for example a native projection keeps every map entry or raises |
| `sightings` | `conformance/vectors/sightings.json` | the upstream fix behaves as fixed; the releases before it show the bug |

## The recorded matrix

This is `conformance/recorded/matrix.md` from the last run. **known** means a failure that is written down in that build's expectations, with its cause.

| Family | `js@17.4.0` | `xdr-json@30.0.0` | `rust@30.0.0` | `go@v0.9.0` | `python@17.0.1` | `python-xdr@0.2.1` | `js@17.2.0` | `js@17.2.1` | `js@17.3.0` | `go@v0.7.1` | `go@v0.7.2` |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `corpus` | 2536 pass | 2484 pass, 13 known | 2536 pass | 1268 pass, 1268 n/a | 2532 pass, 4 known | 2536 pass | not run | not run | not run | not run | not run |
| `strkey` | 164 pass | not run | 164 pass | 163 pass, 1 known | 164 pass | 164 pass | not run | not run | not run | not run | not run |
| `lane-s` | 14 pass | 13 pass, 1 known | 13 pass, 1 known | 12 pass, 2 n/a | 11 pass, 3 known | 14 pass | not run | not run | not run | not run | not run |
| `depth` | 15 pass | 15 pass | 15 pass | 15 pass | 15 pass | 15 pass | not run | not run | not run | not run | not run |
| `sdk-check` | 4 pass | not run | 4 n/a | 4 n/a | 4 known | not run | not run | not run | not run | not run | not run |
| `sightings` | 10 pass | not run | 3 pass, 7 n/a | 3 pass, 7 n/a | 2 pass, 8 n/a | not run | 2 pass, 8 known | 4 pass, 6 known | 10 pass | 2 pass, 1 known, 7 n/a | 3 pass, 7 n/a |
| `deepest ScVal decoded` | 256 levels | 64 levels | 256 levels | 513 levels | 256 levels | 256 levels | not run | not run | not run | not run | not run |

`js@17.4.0` and `python-xdr@0.2.1` read every corpus variant exactly as rs-stellar-xdr does: the bytes, the SEP-0051 JSON and every expected fact.

## Every known failure, and why

Each build's `conformance/expectations/<testee>.json` lists every check it is known to fail, with the reason and the finding it belongs to. They are written from a measured run and reviewed by hand. After that the run must match them exactly: **an unexpected failure and an unexpected pass both fail it**, so a new bug and an upstream fix both show up.

| Builds | Checks | Why |
|---|---|---|
| go@v0.7.1 | 1 | go-stellar-sdk twin of stellar/js-stellar-sdk#1766 (Asset.LessThan by strkey text); fixed in v0.7.2 |
| go@v0.9.0 | 1 | stellar/go-stellar-sdk#6042, #6046 (open): strkey.DecodeAny accepts a claimable-balance key whose type byte is not 0 (SEP-0023 invalid vector) |
| js@17.2.0 | 1 | stellar/js-stellar-sdk#1766 (asset order by strkey text, not XDR bytes); fixed in 17.2.1 / go v0.7.2 |
| js@17.2.0 | 1 | stellar/js-stellar-sdk#1766; fixed in 17.2.1 |
| js@17.2.0, js@17.2.1 | 2 | stellar/js-stellar-sdk#1789 (scValToNative silently drops colliding map keys); fixed in 17.3.0 |
| js@17.2.0, js@17.2.1 | 2 | stellar/js-stellar-sdk#1785 (non-canonical muxed IDs accepted); fixed in 17.3.0 |
| js@17.2.0, js@17.2.1 | 6 | stellar/js-stellar-sdk#1785; fixed in 17.3.0 |
| js@17.2.0, js@17.2.1 | 2 | stellar/js-stellar-sdk#1785 (offer IDs past 2^53 rounded); fixed in 17.3.0 |
| python@17.0.1 | 4 | F-2 (findings/REPORT.md): to_json raises "Unknown SCAddress type: 5" on a CAP-0084 muxed contract address that from_xdr decodes; py-stellar-base#1234 (the protocol 30 tracking issue) asked for CAP-0084 support and warned muxed contract values would fail; this exact to_json failure is not reported; fixed on main by the stellar-xdr switch (py-stellar-base#1268; python-xdr@0.2.1 passes) |
| python@17.0.1 | 4 | StellarCN/py-stellar-base#1250 (closed): scval.to_native keeps 2 of 5 colliding map keys silently; fixed on main by the stellar-xdr switch |
| python@17.0.1 | 1 | a bool of 2 decodes as true (stellar-core's reading; rs-stellar-xdr reads false, rs-stellar-xdr#622); same class as #1262/#1263, rejected by stellar-xdr 0.2.1 on main |
| python@17.0.1 | 1 | StellarCN/py-stellar-base#1262 (closed): non-zero XDR padding accepted; fixed on main |
| python@17.0.1 | 1 | StellarCN/py-stellar-base#1263 (closed): any non-zero optional flag read as present; fixed on main |
| rust@30.0.0, xdr-json@30.0.0 | 2 | stellar/rs-stellar-xdr#622 (open): a bool of 2 decodes as false (generated.rs: b = i == 1) where stellar-core reads it as true |
| xdr-json@30.0.0 | 13 | F-1 (findings/REPORT.md): js-stellar-xdr-json hard-codes XDR_MAX_DEPTH = 500 (src/lib.rs:10, set to mirror the Soroban host's budget limit) and applies it to the whole LedgerCloseMeta, so it refuses ledgers stellar-core wrote whose auth tree is 245 levels deep. Not reported upstream yet. |

## How deep each SDK reads

Nothing crashes on the depth ladder; each SDK refuses cleanly past its limit. The deepest sampled depth each one decodes:

| Build | Deepest ScVal decoded |
|---|---|
| `go@v0.9.0` | 513 levels |
| `js@17.4.0` | 256 levels |
| `python-xdr@0.2.1` | 256 levels |
| `python@17.0.1` | 256 levels |
| `rust@30.0.0` | 256 levels |
| `xdr-json@30.0.0` | 64 levels |

A depth limit counts XDR nesting, and one `ScVal` level costs several units, so equal limits don't mean equal reach: the WASM decoder and the Python packages both use 500 and differ fourfold. The corpus has ledgers stellar-core applied whose Soroban authorization tree is 245 levels deep, and the WASM decoder refuses them (finding F-1 on [Findings](/docs/findings)).
