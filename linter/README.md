# xplint

`xplint` finds, in Go code that reads the Stellar ledger, the three ingestion mistakes the RFP names:

| Rule | Mistake |
|---|---|
| **XP001** | trusting a field stellar-core does not validate |
| **XP002** | walking or decoding a recursive structure (authorization trees, nested ScVals, CAP-0071 delegates) with no depth or size limit |
| **XP003** | deriving participants from the envelope instead of the meta |

Each rule has sub-rules with stable IDs, used as the SARIF `ruleId`:

| Sub-rule | Level | Flags | Instead |
|---|---|---|---|
| `XP001/text-bytes` | warning | memo text, `ScString`, `ScSymbol` or data values (raw bytes core does not check) stored or JSON-encoded unchecked | check `utf8.ValidString` (and NUL) first, or store hex or base64 |
| `XP001/muxed-as-account` | error | a muxed address (`MuxedAccount.Address`, `ScAddress.String`, which can return M, W, L or B) used as an account: a set member, a map key, a builder's account | `ToAccountId().Address()`, or switch on the address kind first |
| `XP001/mux-id-as-identity` | warning | `MuxedAccount.GetId` with its error dropped (a G account reads as ID 0), or the ID narrowed to `int64` or a float | check the error; keep the ID as `uint64` or a decimal string |
| `XP001/contract-number` | warning | an integer from an `ScVal` used as an exponent, a size or a shift count with no bound | compare it with a constant first |
| `XP001/declared-footprint` | warning | the contract taken from the declared footprint recorded as the one the operation touched | read it from the operation's ledger entry changes or events |
| `XP002/walk-unbudgeted` | warning | a recursive walk over a self-referential XDR type with no depth or node budget | carry a depth and a node count; at the limit stop descending and continue |
| `XP002/budget-fails` | error | a walk that returns an error at its budget: core can close a deeper tree, so the error halts ingestion on every retry | stop descending, count or log it, never fail the ledger |
| `XP002/decode-unlimited` | error | `xdr3.DecodeUnlimitedDepth`, or a decode depth above the SDK default of 1500 | decode with the default limit |
| `XP002/alloc-from-wire` | warning | an allocation sized from an integer read off the wire, unbounded | bound it first |
| `XP002/implicit-walk` | note, off | `ScVal.String`, `Equals` or `fmt` on a nested value: bounded only by the decoder | `-implicit-walk` turns it on |
| `XP003/declared-auth` | error | an address from the Soroban authorization tree attributed without confirmation from the meta | confirm it against nonce entries, ledger entry changes or events |
| `XP003/op-body-ungated` | warning | accounts named by an operation body attributed with no check that the transaction succeeded | attribute them only for a successful transaction |
| `XP003/events-ungated` | warning | diagnostic events used for attribution or value records with no success check (`InSuccessfulContractCall` is per call) | only for a successful transaction |

`xplint -list` prints them with their evidence.

## Run it

```sh
go install github.com/XDRProof/xdrproof/linter/cmd/xplint@main
xplint ./...                                   # text: file:line:col: RULE: message
xplint -format sarif -o xplint.sarif ./...     # for GitHub code scanning
xplint -format json ./...
xplint -rules XP002,XP003/declared-auth ./...  # a subset
```

Exit status: 0 no findings, 1 findings, 2 the packages could not be loaded. It needs the same Go toolchain and
cgo setup the packages build with.

In this repository:

```sh
make lint-selftest   # the seeded fixtures and their mutants
make lint            # wallet-backend, stellar-etl, go-stellar-sdk, history and mutants; must match expectations.json
```

Both run in a pinned Go image (`linter/toolchain-image`, Go 1.27.4 on Debian, with gcc for cgo) through
`linter/go.sh`.

## How it works

`xplint` is a set of `golang.org/x/tools/go/analysis` analyzers over SSA.

- **Labels.** A value carries labels for where it came from: text bytes, a possibly muxed address, a contract
  integer, the declared footprint, a wire integer, the authorization tree, an operation body, a diagnostic
  event. Sources are named SDK accessors (`sdk.go`), conversions (`string(ScString)`), field reads (an `*Op`
  struct's account fields, `Memo.Text`) and types that only occur in the envelope
  (`SorobanAuthorizationEntry` and the rest of the auth tree).
- **Propagation** follows SSA values, memory (with first-level struct fields and constant map keys kept
  apart, and a map's keys apart from its values), closures and their free variables, and calls. Each function
  gets a summary (what its results carry, which arguments flow to them, which arguments reach a sink, whether
  it checks UTF-8), exported to importing packages as an analysis fact.
- **Gates** count only when they dominate the sink: a success check (`Successful()`, the result code), a
  membership test against a collection built from the meta, a UTF-8 check, a bound against a constant, a
  switch on the address kind. A gate in a block whose every incoming edge carries the check counts
  (`case A, B:`), and so does a success check in every local caller of a function.
- **XP002** finds recursion with a per-package call graph. The recursive XDR types are computed from the SDK's
  own type graph, so `SorobanDelegateSignature.NestedDelegates` (CAP-0071, hazard H-B14) is covered without a
  list; `ClaimPredicate` and `ScpQuorumSet` are excluded because stellar-core caps them at depth 4
  (v30.0.0 `CreateClaimableBalanceOpFrame.cpp:78`, `QuorumSetUtils.cpp:16,60`). A budget is an integer that
  changes across the recursion (a stepped parameter, or a counter outside the walker) and is compared.

Tests and generated files are skipped.

## Results (`make lint`)

Every finding below is pinned, with its triage, in [`expectations.json`](expectations.json); the full table is
[`recorded.md`](recorded.md).

| Target | Findings | Triage |
|---|---|---|
| wallet-backend `main` (`18db88f4`) | 5 | all true positives: `walkInvocation` (#820, open) and four places where the Blend decoder uses `ScAddress.String` as an account, the shape #756 fixed in the SEP-41 processor |
| `main` + the #820 patch + the Blend address patch | **0** | |
| stellar-etl `master` (`7e3fc9af`) | 13 | all true positives: #504 (memo bytes to JSON) ×2, #462 (contract ID from the footprint) ×8, #488 (balance changes from diagnostic events of failed transactions) ×2, and one success-ungated `Participants()` nothing calls |
| go-stellar-sdk v0.9.0 `ingest/`, `processors/` | 0 | |

**History.** Each fixed upstream bug of these kinds is caught before its fix and gone after it:

| Commits | Change |
|---|---|
| wallet-backend `f8e5786d` → `bb0b162b` (#753) | `muxed-as-account` in `contract_operations.go`: 10 → 3 |
| `bb0b162b` → `666a64d4` (#756) | `muxed-as-account` in `contracts/sac.go`: 1 → 0 |
| `666a64d4` → `4bbb1ecb` (`9538b3ca`, `80121f3a`) | `declared-auth` 23 → 0, the remaining `muxed-as-account` 3 → 0, `op-body-ungated` 2 → 0 (the success check moved first), the auth-tree participant walk 1 → 0; only `walkInvocation` (#820) stays |
| `e967ce8b` → `ff73ff46` (#803) | `text-bytes` on Blend pool names: 1 → 0 |

**Mutants of `main`.** Five fixed bugs put back into current code; each makes its rule fire: the deploy's
meta confirmation removed (`declared-auth`), the success gate of `GetOperationParticipants` removed
(`op-body-ungated`), #753 reverted (`muxed-as-account`), the Blend UTF-8 check removed (`text-bytes`), and the
first, wrong #820 patch that fails at depth 64 (`budget-fails`).

**Fixtures.** `make lint-selftest`: 25 seeded violations across all twelve default sub-rules (each modelled on
real code, named in the fixture), every one caught, and no finding on the 21 good cases; 17 mutants of the good
cases (a guard removed, a fixed bug put back), every one caught.

## Does it run clean on current wallet-backend?

The RFP's check is that the linter "runs clean on current wallet-backend". We read that as: **no false
positives**. `make lint` reports five findings on `main`, and each is a true positive:

1. `contract_deploy.go:116` `walkInvocation` walks the declared authorization tree with no depth or node bound
   (wallet-backend#820, open, filed by another entrant). It is hardening: at today's limits the deepest tree a
   transaction can apply is 245 levels, which the walk survives. `patches/wallet-backend-820.diff` bounds it at
   depth 256 and 4096 nodes, above anything core applies, and stops (counted and logged) instead of failing;
   our first version failed at depth 64 and would have halted on the 245-deep ledgers in the corpus, which is
   what `XP002/budget-fails` now catches.
2. Four sites in `internal/services/blend` use `ScAddress.String()` (via `addrString`) as an account key.
   wallet-backend fixed exactly this in its SEP-41 processor (#756), noting that "a real contract cannot emit
   them today"; the Blend decoder (#798, added later) does not use the same helper. It is not reachable today:
   only Blend WASM the indexer pinned is decoded, and Blend takes `Address` arguments, which the host limits to
   G and C. `patches/wallet-backend-blend-address.diff` routes it through `types.StorableAddressString`.

With both patches, xplint reports nothing on wallet-backend, and wallet-backend's own `go build`, `go vet` and its
processor and Blend tests (against TimescaleDB) pass, as they do on `main`. Opening the pull requests is the maintainers' call.

## Limits

- Calls through interfaces and function values are not followed (except closures, which are); the call graph
  for summaries is per package, with facts across packages for the SDK and the loaded modules.
- Flows through a database are not followed. wallet-backend #802 (Blend decimals stored, read back by the API
  and used as an exponent) is out of reach for that reason; the in-memory shape is caught.
- Memory is field-sensitive one level deep; deeper fields and slice elements share their root's labels.
- Builder methods count as attribution when their name says which role the address plays (`WithAccount`,
  `WithCreator`, ...); a role spelled otherwise is not seen.
- The sources and sinks are a catalogue of go-stellar-sdk and standard-library APIs (`xplint/sdk.go`); code
  that reads XDR through its own types needs entries added.
- No false-positive rate is claimed: the 18 findings on the three codebases' current code, and every finding
  on the history commits, are triaged true, but three codebases are too few to state a rate.

The guide carries the same three checks as a language-neutral checklist for indexers written in other languages.
