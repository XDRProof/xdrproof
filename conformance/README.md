# Conformance

`make conformance` runs the corpus, and a set of vectors, through real SDK builds and prints one matrix: which
SDK reads which ledger correctly. Every SDK runs as a **testee**, a process that speaks line-delimited JSON on
stdin/stdout. The runner (`run.mjs`) judges every answer against a reference and against the SDK's
**pre-registered expectations** (`expectations/<testee>.json`). An unexpected failure, and an unexpected pass,
both fail the run, so a fixed bug and a new one are both visible.

## Testees

| Testee | Package | Families |
|---|---|---|
| `js@17.4.0` | `@stellar/stellar-sdk` 17.4.0 (its XDR layer is `@stellar/js-xdr` 5, written in JavaScript) | all |
| `xdr-json@30.0.0` | `@stellar/stellar-xdr-json` 30.0.0 (rs-stellar-xdr compiled to WASM, used across the JS ecosystem) | corpus, lane S, depth |
| `rust@30.0.0` | `stellar-xdr` =30.0.0 with `stellar-strkey` 1.0.0 | all but native projection |
| `go@v0.9.0` | `github.com/stellar/go-stellar-sdk` v0.9.0 | all but SEP-0051 JSON and native projection |
| `python@17.0.1` | `stellar-sdk` 17.0.1 (py-stellar-base), the current release | all |
| `python-xdr@0.2.1` | `stellar-xdr` 0.2.1 and `stellar-strkey` 0.2.0, the standalone packages py-stellar-base's next major release is built on | corpus, strkey, lane S, depth |
| `js@17.2.0`, `js@17.2.1`, `js@17.3.0`, `go@v0.7.1`, `go@v0.7.2` | the releases before and after upstream fixes | sightings |

Java, Swift, Dart, PHP and .NET SDKs can join by implementing the protocol below.

## Protocol (version 1)

Each request is one line, `{"id", "op", "input"}`; each answer one line, `{"id", "status", ...}` with
`status` one of `ok`, `error` (with `error: {stage, message}`) or `unsupported` (with `reason`).

| `op` | `input` | Answer when `ok` |
|---|---|---|
| `hello` | none | `implementation: {sdk, package, version, runtime}`, `ops: [...]` |
| `decode` | `{type, xdr}`: an XDR type name as rs-stellar-xdr spells it (`LedgerCloseMeta`, `ScVal`, `Operation`, ...) and base64 bytes | `xdr`: the testee's own re-encoding, base64; `json`: its SEP-0051 rendering, if it has one |
| `encode_json` | `{type, json}` | `xdr`: base64 |
| `strkey_decode` | `{strkey}` | `kind`: the strkey's first letter (G S M T X P C W L B); `payload`: hex of the bytes between version byte and checksum |
| `native` | `{type: "ScVal", xdr}` | `value`: the SDK's native projection, rendered losslessly (`{"$bigint"}`, `{"$bytes"}`, `{"$object": [[k, v], ...]}`) |
| sighting ops | see `vectors/sightings.json` | as the vector says |

A testee answers `unsupported` for anything its SDK cannot do; that is recorded as not applicable, not as a failure.

## Families and checks

| Family | Input | Pass when |
|---|---|---|
| `corpus` | every variant of every entry in `entries/` | `decode` succeeds; the re-encoding is byte-identical; for testees with SEP-0051 JSON, the JSON equals rs-stellar-xdr's (the reference) and every expected fact of the entry holds on the testee's own JSON (the same checks `make verify` runs) |
| `strkey` | the SEP-0023 test vectors, plus every distinct address of each kind found in the corpus (a deterministic sample) | valid keys decode to the reference kind and payload (`tools/strkey.mjs`); invalid keys are rejected |
| `lane-s` | hand-built invalid XDR (`vectors/lane-s.json`): truncated, trailing bytes, a bool of 2, unknown and negative discriminants, a symbol past its maximum, non-zero padding, an optional flag of 2, a huge length with no data (rs-stellar-xdr#581), a path longer than five both as XDR and as JSON (rs-stellar-xdr#598) | every invalid input is rejected; the valid controls are accepted |
| `depth` | an `ScVal` vector nested 64 to 4000 deep | measured: the deepest value each SDK decodes, and whether anything crashes |
| `sdk-check` | each entry's `expected.sdk_checks` | the helper behaves as the check says (for example, a native projection keeps every map entry or raises) |
| `sightings` | `vectors/sightings.json` | the upstream fix behaves as fixed; releases before it show the bug |

## Expectations

`expectations/<testee>.json` lists every check that testee is known to fail, each with the reason and the
finding it belongs to (`findings/REPORT.md`), and its measured maximum depth. They are written from a
measured run and reviewed by hand (`node conformance/run.mjs --record` prints the draft); after that, the
run must match them exactly.
