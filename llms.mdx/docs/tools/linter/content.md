# Linter (/docs/tools/linter)

**What it is.** `xplint` reads the Go source of an indexer and points at the lines that make one of three mistakes: trusting a field stellar-core never checked, walking a nested structure with no limit, or taking a transaction's participants from what it asked for instead of what happened.

**Why it matters.** These three mistakes are how real indexers have halted or stored wrong data. The linter finds the code patterns themselves, whether or not a ledger has triggered them yet. On wallet-backend `main` it reports 4, all real code patterns and none reachable by a ledger today: one is hardening at today's limits, three sit in code Blend's contracts cannot reach. With XDRProof's two patches it reports 0.

![A terminal: xplint on wallet-backend main reports four findings (one unbounded walk, three muxed addresses used as accounts), writes the same four as SARIF, then both XDRProof patches are applied and xplint exits 0 with no findings.](https://xdrproof.dev/gifs/lint.gif)

## Run it

```bash
go install github.com/XDRProof/xdrproof/linter/cmd/xplint@main
xplint ./...                               # text, one finding a line
xplint -format sarif -o xplint.sarif ./... # GitHub code scanning
xplint -format json ./...
xplint -rules XP002,XP003/declared-auth ./...
xplint -list                               # every rule, with evidence
```

The exit status is 0 with no findings, 1 with findings, and 2 when the packages could not be loaded. It needs the same Go toolchain and cgo setup the packages build with.

In this repository, both targets run in a pinned Go image (`linter/toolchain-image`) through `linter/go.sh`:

```bash
make lint-selftest   # seeded fixtures and mutants (~2 min warm)
make lint            # real code, against expectations.json (about 8 min fresh; seconds when nothing changed)
```

A real run of `make lint`, recorded 24 Nov 2026:

```text
 XDRPROOF   lint  · xplint · 3 codebases · 3 upstream fixes · 5 mutants

  ╭─ wallet-backend main · 18db88f4 ───────────────── 4 findings─╮
  │ ! Blend may key accounts by M... addresses              #756 │
  │ ! auth-tree walk has no depth limit                     #820 │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ stellar-etl master · 7e3fc9af ───────────────── 12 findings─╮
  │ ! contract IDs guessed from the footprint               #462 │
  │ ! invalid UTF-8 memos exported as U+FFFD                #504 │
  │ ! balance changes kept for failed Soroban txs           #488 │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ go-stellar-sdk v0.9.0 · 5410d341 ─────────────── 0 findings─╮
  │ ✓ no findings                                                │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Caught before the fix, gone after ───────────────────── 3/3─╮
  │ ✓ #753 Soroban source kept as M...                    10 → 0 │
  │ ✓ 9538b3c participants taken from the auth tree       28 → 0 │
  │ ✓ #803 Blend pool names not UTF-8 checked              1 → 0 │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Our patches for wallet-backend ──────────────────────── 2/2─╮
  │ ✓ #820 patch: the walk is bounded                      4 → 3 │
  │ ✓ and Blend addresses as #756 does                     3 → 0 │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Mutants of wallet-backend main ──────────────────────── 5/5─╮
  │ ✓ drop the meta confirmation of a declared deploy      XP003 │
  │ ✓ attribute operation bodies of failed transactions    XP003 │
  │ ✓ muxed Soroban source added as M...                   XP001 │
  │ ✓ Blend strings stored without the UTF-8 check         XP001 │
  │ ✓ the auth-tree walk fails at depth 64                 XP002 │
  ╰──────────────────────────────────────────────────────────────╯

 PASSED   Every finding as recorded, every mutant caught.   0.1s

  results reused from the last run · ARGS=--fresh runs them again
  rules, verdicts and timings:  make lint DETAILS=1
```

## The three mistakes

3 rules, 12 sub-rules on by default (13 in all). Each sub-rule has a stable ID, used as the SARIF `ruleId`. The table is read from `linter/xplint/rules.go`.

| Sub-rule | Level | Flags | Instead |
|---|---|---|---|
| `XP001/text-bytes` | warning | Memo text, ScString and ScSymbol are raw bytes stellar-core does not check; this value reaches storage or a JSON encoder unchecked | Check utf8.ValidString (and reject NUL) before storing or encoding, or store the bytes as hex or base64. |
| `XP001/muxed-as-account` | error | A muxed address (M..., or any ScAddress kind) is used where an account is expected | Use ToAccountId().Address() for the account and keep the muxed ID in its own field; switch on ScAddress.Type before treating it as an account. |
| `XP001/mux-id-as-identity` | warning | A muxed ID is read with its error ignored, or narrowed to a signed or floating type | Check the error from GetId (a plain G account has no ID) and keep the ID as uint64 or a decimal string; core does not validate it. |
| `XP001/contract-number` | warning | An integer chosen by a contract (an ScVal) sizes an allocation, an exponent or a shift without a bound | Compare it against a constant limit before using it as an exponent, size or shift count. |
| `XP001/declared-footprint` | warning | The Soroban footprint is what the submitter declared; it is used here as the contract or entries the transaction touched | Read the contract from the operation's ledger entry changes or events, or confirm the declared one against them. |
| `XP002/walk-unbudgeted` | warning | A recursive walk over a self-referential XDR type has no depth or node budget; nesting is chosen by the submitter | Carry a depth counter and a node count; when a limit is reached, stop descending and continue (log or count it). Never fail the ledger. |
| `XP002/budget-fails` | error | A recursive walk returns an error when its depth or node budget is exceeded; the error repeats on every retry and halts ingestion | Stop descending and continue (log or count it). Core can close a ledger with a larger tree than any limit the indexer picks. |
| `XP002/decode-unlimited` | error | XDR is decoded with no depth limit, or a limit above the SDK default | Decode with the default limit (xdr.SafeUnmarshal, MaxDepth 1500) or lower. |
| `XP002/alloc-from-wire` | warning | An allocation is sized from an integer read off the wire, with no bound | Bound the size against a constant before allocating. |
| `XP002/implicit-walk` | note, off by default | An SDK helper (String, Equals, fmt %v) recurses over a submitter-nested value with no budget of its own | It is bounded only by the decoder's depth limit; avoid it on hot paths or on values whose depth you have not bounded. |
| `XP003/declared-auth` | error | An address from the declared Soroban authorization tree is attributed without confirmation from the meta | An auth entry says what was permitted, not what ran. Take the address from nonce entries, ledger entry changes or events, or confirm it against them. |
| `XP003/op-body-ungated` | warning | An account from an operation body is attributed with no check that the transaction succeeded | A failed transaction changes nothing but its fee. Attribute operation-body accounts only when the transaction succeeded. |
| `XP003/events-ungated` | warning | Diagnostic events are used for attribution with no check that the transaction succeeded | Diagnostic events exist for failed transactions; InSuccessfulContractCall is per call, not per transaction. |

## How it decides

Figure: how xplint decides. A value from ScAddress.String(), which may be a muxed, contract, pool or balance address, reaches a map key that outlives the function with no check on the way: XP001/muxed-as-account. Through a switch on the address kind first, only an account reaches the sink, and nothing is reported.

- **Where a value came from.** Each value carries labels for its source: text bytes, a possibly muxed address, a number a contract chose, the declared footprint, the authorization tree, an operation body, a diagnostic event. Sources are named SDK calls, conversions and field reads.
- **Where it is kept.** A sink is where a value is stored: a JSON- or db-tagged field, a map key, a set member, a builder's account. A map or set counts only when it outlives the function; a scratch map for de-duplication is not attribution.
- **What clears it.** A check counts only when every path to the sink passes through it, and only for the value it checked: checking `good` does not clear `bad + good`. A success check clears operation bodies and events on its branch.
- **Recursion.** XP002 finds recursive walks over the XDR types that can nest, computed from the SDK's own type graph, so CAP-0071's nested delegates are covered without a list. A budget must stop the walk; a budget that only logs, or that fails the ledger, is reported.

## On real code

| Code | Findings | By rule |
|---|---|---|
| `wallet-backend@main` | 4 | XP002/walk-unbudgeted 1, XP001/muxed-as-account 3 |
| `stellar-etl@master` | 12 | XP001/text-bytes 2, XP003/events-ungated 2, XP001/declared-footprint 8 |
| `go-stellar-sdk@v0.9.0` | 0 | clean |
| `wallet-backend@main+820-patch` | 3 | XP001/muxed-as-account 3 |
| `wallet-backend@main+820-patch+blend-address-patch` | 0 | clean |

<Callout type="warn" title="The RFP's check: clean on current wallet-backend">
Not yet on unmodified `main`: its 4 findings are real. With XDRProof's two tested patches, offered upstream, xplint reports 0. Until an unmodified current revision runs clean, this check stays open.
</Callout>

### wallet-backend `main`

| Where | Rule | Verdict | Why | Upstream |
|---|---|---|---|---|
| `internal/indexer/processors/contract_deploy.go:116` | `XP002/walk-unbudgeted` | true positive | walkInvocation walks the declared authorization tree with no depth or node bound; harmless at today's limits (245 levels apply), hardening. Fixed by linter/patches/wallet-backend-820.diff (bounds 256 and 4096, stops instead of failing) | [wallet-backend#820](https://github.com/stellar/wallet-backend/issues/820) |
| `internal/services/blend/processor.go:387` | `XP001/muxed-as-account` | true positive (hardening) | Blend's addrString stringifies any ScAddress with no kind check and the result keys accounts. The same shape #756 fixed in the SEP-41 processor with types.StorableAddressString ('a real contract cannot emit them today'). Unreachable today: only pinned Blend WASM is decoded, and Blend takes Address arguments, which the host limits to G and C. Fixed by linter/patches/wallet-backend-blend-address.diff | [wallet-backend#756](https://github.com/stellar/wallet-backend/pull/756) |
| `internal/services/blend/processor.go:579` | `XP001/muxed-as-account` | true positive (hardening) | Blend's addrString stringifies any ScAddress with no kind check and the result keys accounts. The same shape #756 fixed in the SEP-41 processor with types.StorableAddressString ('a real contract cannot emit them today'). Unreachable today: only pinned Blend WASM is decoded, and Blend takes Address arguments, which the host limits to G and C. Fixed by linter/patches/wallet-backend-blend-address.diff | [wallet-backend#756](https://github.com/stellar/wallet-backend/pull/756) |
| `internal/services/blend/scval.go:182` | `XP001/muxed-as-account` | true positive (hardening) | Blend's addrString stringifies any ScAddress with no kind check and the result keys accounts. The same shape #756 fixed in the SEP-41 processor with types.StorableAddressString ('a real contract cannot emit them today'). Unreachable today: only pinned Blend WASM is decoded, and Blend takes Address arguments, which the host limits to G and C. Fixed by linter/patches/wallet-backend-blend-address.diff | [wallet-backend#756](https://github.com/stellar/wallet-backend/pull/756) |

The unbounded walk is wallet-backend#820: today's deepest tree (245 levels) survives it, so it is hardening. XDRProof's patch bounds it at depth 256 and 4,096 nodes and stops, counted and logged, instead of failing; it is offered on [#820](https://github.com/stellar/wallet-backend/issues/820#issuecomment-7009772300). The three Blend sites are the shape wallet-backend fixed in its SEP-41 processor (#756), not reachable today. Both patches are in [`linter/patches/`](https://github.com/XDRProof/xdrproof/tree/main/linter/patches); with them, wallet-backend's own build, vet and tests pass.

### stellar-etl `master`

| Where | Rule | Verdict | Why | Upstream |
|---|---|---|---|---|
| `cmd/export_transactions.go:43` | `XP001/text-bytes` | true positive | MEMO_TEXT bytes, which core does not validate as UTF-8, exported to JSON unchecked | [stellar-etl#504](https://github.com/stellar/stellar-etl/issues/504) |
| `internal/transform/operation.go:1102` | `XP003/events-ungated` | true positive | asset_balance_changes built from diagnostic events with no check that the transaction succeeded (InSuccessfulContractCall is per call) | [stellar-etl#488](https://github.com/stellar/stellar-etl/issues/488) |
| `internal/transform/operation.go:1111` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1132` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1157` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1164` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1725` | `XP003/events-ungated` | true positive | asset_balance_changes built from diagnostic events with no check that the transaction succeeded (InSuccessfulContractCall is per call) | [stellar-etl#488](https://github.com/stellar/stellar-etl/issues/488) |
| `internal/transform/operation.go:1734` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1755` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1780` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/operation.go:1787` | `XP001/declared-footprint` | true positive | contract_id is the first contract-data key of the declared footprint, which can name the wrong contract (factory patterns, multi-contract footprints) | [stellar-etl#462](https://github.com/stellar/stellar-etl/issues/462) |
| `internal/transform/transaction.go:247` | `XP001/text-bytes` | true positive | MEMO_TEXT bytes, which core does not validate as UTF-8, exported to JSON unchecked | [stellar-etl#504](https://github.com/stellar/stellar-etl/issues/504) |

## Before and after each upstream fix

The same rules on the wallet-backend commits around fixes of these mistakes. Each fixed bug is caught before its fix and gone after it.

| wallet-backend commit | Findings | By rule |
|---|---|---|
| `f8e5786d` | 37 | XP002/walk-unbudgeted 2, XP003/declared-auth 23, XP001/muxed-as-account 11, XP003/op-body-ungated 1 |
| `bb0b162b` | 30 | XP002/walk-unbudgeted 2, XP003/declared-auth 23, XP001/muxed-as-account 4, XP003/op-body-ungated 1 |
| `666a64d4` | 29 | XP002/walk-unbudgeted 2, XP003/declared-auth 23, XP001/muxed-as-account 3, XP003/op-body-ungated 1 |
| `4bbb1ecb` | 1 | XP002/walk-unbudgeted 1 |
| `e967ce8b` | 4 | XP001/muxed-as-account 3, XP001/text-bytes 1 |
| `ff73ff46` | 3 | XP001/muxed-as-account 3 |

## Fixed bugs put back

Mutants of current wallet-backend `main`: a fixed bug put back, or a guard removed. Each must make its rule fire.

| Mutant of main | Must fire | Fired |
|---|---|---|
| drop the meta confirmation of a declared deploy | `XP003/declared-auth` | caught |
| attribute operation bodies of failed transactions | `XP003/op-body-ungated` | caught |
| muxed Soroban source added as M... | `XP001/muxed-as-account` | caught |
| Blend strings stored without the UTF-8 check | `XP001/text-bytes` | caught |
| the auth-tree walk fails at depth 64 | `XP002/budget-fails` | caught |

## Self-test

`make lint-selftest` runs xplint on seeded fixtures, each modelled on real code and named in its fixture, then mutates the good cases.

44 seeded violations, each caught at its marked line · 31 good cases, none flagged · 17 mutants of the good cases, each caught

The near misses are seeded too: a check on a different memo than the one stored, a bound on the wrong branch, `max` used as a bound, a helper that calls the UTF-8 check and ignores it, a budget that only logs, a method that happens to be called `Successful`.

## Limits

- Calls through interfaces and function values are not followed (closures are), nor values sent over channels.
- Flows through a database are not followed: wallet-backend #802 (Blend decimals stored, read back and used as an exponent) is out of reach; the in-memory shape is caught.
- Memory is tracked one struct field deep; deeper fields and slice elements share their root's labels.
- The sources and sinks are a catalogue of go-stellar-sdk and standard-library calls (`xplint/sdk.go`); code that reads XDR through its own types needs entries added.
- No false-positive rate is claimed. Every finding on the three codebases and on the history commits is triaged true, but three codebases are too few to state a rate.

The full list is in [`linter/README.md`](https://github.com/XDRProof/xdrproof/blob/main/linter/README.md).
