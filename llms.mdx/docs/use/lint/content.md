# Lint your Go indexer (/docs/use/lint)

**What it is.** `xplint` reads your Go indexer's source and points at the exact lines that make one of three mistakes. You run it on your own repository with one command; there is nothing to install first.

**Why it matters.** These three mistakes are how real indexers have halted or stored wrong data. Finding them in review costs a minute; finding them after a ledger arrives costs an incident.

## The three mistakes, in plain words

| Rule | The mistake | What to do instead |
|---|---|---|
| **XP001** | Trusting a field stellar-core does not check. Memo text, contract strings and muxed addresses are whatever the sender put there. | Validate the bytes (UTF-8, length), and switch on an address's kind before treating it as an account. |
| **XP002** | Walking a nested structure with no limit. Authorization trees and nested contract values can be hundreds of levels deep. | Carry a depth and a node budget, and at the limit stop descending. Never fail the ledger: it fails again on every retry. |
| **XP003** | Taking participants from the envelope. The envelope says what a transaction asked for; the meta says what happened. | Attribute accounts from the meta, and only for transactions that succeeded. |

Each rule has sub-rules with stable IDs; the full list, with the evidence behind each, is on [Linter](/docs/tools/linter#the-three-mistakes).

## Run it

From your repository's root, with Go 1.26 or later and the same cgo setup your packages build with:

```bash
go run github.com/XDRProof/xdrproof/linter/cmd/xplint@latest ./...
```

Go fetches the linter's module straight from GitHub (`github.com/XDRProof/xdrproof/linter`); nothing is cloned or installed. It needs no module of its own either: run from an empty folder, `go run github.com/XDRProof/xdrproof/linter/cmd/xplint@latest -list` printed every rule. Run from an empty folder on a fresh clone of [stellar/wallet-backend](https://github.com/stellar/wallet-backend) at `18db88f`, in the `golang:1.27` image with an empty module cache, it printed:

```text
internal/indexer/processors/contract_deploy.go:116:2: XP002/walk-unbudgeted: closure walkInvocation recurses over SorobanAuthorizedInvocation with no depth or node budget
internal/services/blend/processor.go:387:21: XP001/muxed-as-account: an address that may be muxed (M...) or not an account is passed to stageHistoryRow, where it reaches .WithAccount() at blend/processor.go:439; it comes from ScAddress.String at blend/scval.go:71
internal/services/blend/processor.go:579:16: XP001/muxed-as-account: an address that may be muxed (M...) or not an account is passed to routeEntry, where it reaches a map key at blend/processor.go:819; it comes from ScAddress.String at blend/scval.go:71
internal/services/blend/scval.go:182:6: XP001/muxed-as-account: an address that may be muxed (M...) or not an account reaches a map key; it comes from ScAddress.String at blend/scval.go:71
exit status 1
```

Each line is `file:line:col: RULE: message`. The exit status is 0 with no findings, 1 with findings, and 2 when the packages could not be loaded. All four of these are real; what each one means, and the patches that clear them, are on [Linter](/docs/tools/linter#wallet-backend-main).

## In CI: SARIF for GitHub code scanning

```bash
go run github.com/XDRProof/xdrproof/linter/cmd/xplint@latest \
  -format sarif -o xplint.sarif ./...
```

The same run wrote the same four findings as SARIF 2.1.0:

```text
      3 "ruleId": "XP001/muxed-as-account"
      1 "ruleId": "XP002/walk-unbudgeted"
```

Upload `xplint.sarif` with GitHub's `github/codeql-action/upload-sarif` and each finding appears on its line in pull requests. Other flags: `-format json`, `-rules XP002,XP003/declared-auth` for a subset, and `-list` for every rule.

<Callout title="What it does not see">
xplint follows Go values through SSA within and across your packages. It does not follow calls through interfaces or function values, values sent over channels, or flows through a database, and it knows the go-stellar-sdk's accessors, not your own XDR types. A clean run means none of the patterns it knows, not no bugs. [Limits](/docs/tools/linter#limits)
</Callout>
