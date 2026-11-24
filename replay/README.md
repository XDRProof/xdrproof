# Replay

`make replay` feeds every corpus ledger into a real indexer and gives each variant a **verdict** read from
the indexer's own state: whether its process survived, whether its cursor got past the ledger, and what it
stored. Nothing is read from log text. The indexer is reached only through an **adapter**, a directory with a
TOML file and a few shell commands, so any indexer that can read `getLedgers` can be tested the same way.

The reference adapter is [stellar/wallet-backend](https://github.com/stellar/wallet-backend), at `main` and at
the commits before and after each upstream fix the corpus reproduces. Results: [recorded/wallet-backend.md](recorded/wallet-backend.md).

```sh
make replay              # the whole corpus into wallet-backend main, then every sighting (~20 min cold)
make replay-main         # the corpus only
make replay-sightings    # #729/#716, #731, #745, #753 before and after their fixes
node replay/harness.mjs --adapter wallet-backend --target main --entries muxed.payment.every-position
```

Needs Docker, Node 22.15 or later, and the native reader (`make native`). Nothing reaches the network once the
images and Go modules are cached: the ledgers come from the corpus through a mock stellar-rpc.

While it runs, `make replay` shows one live row per part: the corpus into `main` (its sessions and the time left,
or the step it is on, such as starting the database) and the fixes (which commit, and its step). Each harness
run's full output goes to `replay/.work/logs/<target>.log`. At the end it prints two cards: `main`'s score with
one row per known issue and its link, and each fix as its verdict before and after. `make replay DETAILS=1` adds
the verdict and ledger count behind each row, timings and memory. `recorded/wallet-backend.md` is rewritten only
by a full `make replay` that passed.

Measured on a laptop under Docker, 6 sessions at a time, on 24 Nov 2026: the full `make replay` (635 variants in 365
sessions against `main`, plus 28 sighting sessions at ten older commits) takes 9.8 minutes once the eleven builds
are cached; a session against `main` takes 4.0 s on average and 10.4 s at most. wallet-backend's peak memory in any
session is 101 MiB. The harness's own peak is 124 MiB for the whole corpus: each ledger is read as JSON in a
short-lived child process (310 MiB at most, for a 1.4 MB pubnet ledger), and sessions read their facts back from
disk one at a time, so the harness does not grow with the corpus.

## A session

One session replays one ledger (one distinct variant: its bytes and its network) into a fresh store.

1. **Derive.** `lib/derive.mjs` reads the ledger with rs-stellar-xdr and lists the **probes**: the facts a correct
   indexer has stored after ingesting it (below). They come from the ledger alone, and are cached under the
   ledger's bytes (checked against the manifest) and a fingerprint of the code that derives them.
2. **Serve.** `lib/mock-rpc.mjs` serves the ledger as stellar-rpc v30.0.1 would (below).
3. **Prepare.** The adapter gives the indexer a clean store whose cursor sits just before the ledger.
4. **Start and watch.** The adapter starts the indexer pointed at the mock. The harness polls the indexer's
   cursor until it passes the ledger, the process exits, the cursor stops moving for `ledger_s`, or the attempt
   reaches `session_s`. Once the ledger is passed, the process must still be running a second later. A cursor
   the adapter cannot read for 10 s is the adapter's failure, never a stall.
5. **Restart once.** If the ledger was not passed, the indexer is started again on the same store.
6. **Observe.** The adapter answers every probe from what the indexer stored. The harness compares.

Before any session counts, the harness replays the **controls** (`controls.json`): the plainest ledger of each
protocol the target can decode. Each must get past its ledger, or the run stops as a setup failure.

## Verdicts

| Verdict | Rule |
|---|---|
| `handled` | the cursor passed the ledger and every applicable probe matches |
| `dropped` | the cursor passed, and a fact the ledger states is not stored |
| `mishandled` | the cursor passed, and a stored value differs from the ledger, or an invariant fails |
| `stalled` | the first attempt stopped making progress on the ledger without exiting, the restart got past it; probes are judged as well |
| `crashed` | the first attempt exited on the ledger, before or right after committing it, and the restart got past it; probes are judged as well |
| `halted` | neither attempt passed the ledger (the process exits each time, or stops moving) |
| `unsupported` | the ledger's protocol is newer than the target decodes (`protocol_max`), or its network is not supported |
| `error` | an adapter command failed, or the adapter left a probe kind it declares unanswered; never a finding (the run exits 2) |

## Probes

Each probe names a fact by its key and states the expected value in a canonical form: strkeys, decimal strings,
XDR enum names. A muxed `M…` account is named by its `G…` account.

| Probe | Key | Expected |
|---|---|---|
| `tx.present` | transaction hash (the outer one for a fee bump) | stored |
| `tx.result` | transaction | the result code, as the XDR enum (`txSUCCESS`, `txFEE_BUMP_INNER_FAILED`, `txBAD_SEQ`, ...) |
| `tx.fee_charged` | transaction | `feeCharged` from the result (none before protocol 21 for a Soroban fee bump, where core's figure omitted the refund: stellar-core#4188) |
| `tx.operations` | transaction | the number of operations (the inner transaction's for a fee bump) |
| `tx.inner_hash` | fee-bump transaction | the inner transaction's hash |
| `tx.participant` | transaction, account | the source and the fee source are attributed to the transaction |
| `op.participant` | transaction, operation index, account | each operation's source is attributed to its operation, when the transaction succeeded |
| `account.created`, `account.removed` | transaction, account | the account entry the transaction created or removed is recorded |
| `contract.created` | transaction, contract | the contract instance the transaction created is recorded |
| `signer.added`, `signer.updated`, `signer.removed` | transaction, account, signer key | the signer change is recorded, with the new weight |
| `trustline.added`, `trustline.removed` | transaction, account, asset | the trustline the transaction created or removed is recorded |
| `balance.native`, `balance.trustline` | account (and asset) | the balance at the end of the ledger, or nothing if the entry is gone; asserted only where the ledger changes it |

Two **invariants** are judged over everything the indexer stored for the session:

| Invariant | Holds when |
|---|---|
| `addresses.valid` | every stored address decodes as a strkey and is one the ledger names (with `M…` as `G…`, `W…` as `C…`, and the asset contract of every classic asset it names) |
| `facts.extra` | every stored account or contract creation, account merge and trustline add or remove is one the ledger states |

The invariants are coarse on purpose: `addresses.valid` cannot tell one valid address the ledger names from
another, and `facts.extra` covers creations, merges and trustline changes only. The per-fact probes catch
substitutions of the facts they key.

Facts on which indexers differ on purpose are not asserted: the participants of a failed transaction beyond the
accounts that paid, whether an account's master key is a "signer", and balances the ledger does not change
(a session starts without the indexer's prior state).

## The mock stellar-rpc

Every field comes from the ledger: `getLedgers` (hash, `ledgerCloseTime`, `headerXdr` as the
`LedgerHeaderHistoryEntry` bytes, `metadataXdr`, or both as JSON with `xdrFormat: json`), `getHealth`,
`getLatestLedger`, `getNetwork` and `getVersionInfo`; pagination, page limits (50 by default, 200 at most) and the
validation errors follow stellar-rpc v30.0.1 word for word. `getLedgerEntries` answers from the state the
session's ledgers leave behind: the entry, its extension, its last-modified ledger and its TTL
(`tools/native`'s `ledger_entries`).

The mock knows only what the session's ledger states, so it knows less than stellar-rpc in three ways, each
recorded per session: a method it does not serve, or an HTTP request such as a history-archive fetch, is refused;
a ledger entry the ledger does not touch is answered "not found", though on a real network it may exist; and a
contract entry whose TTL the ledger leaves untouched is served without `liveUntilLedgerSeq`. A verdict other than
`handled` in a session that read such state is flagged, and its cause must be traced in the indexer's code before
it is recorded. wallet-backend reads two Blend backstop contract instances in every session (its Blend validator,
at startup); every recorded verdict is traced to code that does not involve them.

## Adapter contract

An adapter is a directory under `adapters/` with an `adapter.toml`:

| Field | Meaning |
|---|---|
| `delivery.kind` | `rpc`: the indexer reads the mock stellar-rpc |
| `supports.networks` | `pubnet`, `testnet` |
| `supports.probes` | the probe kinds `observe` answers; every other kind is not applicable |
| `targets.<name>` | `ref` (a commit) and `protocol_max` (the newest protocol its decoder reads) |
| `commands` | below; run from the adapter directory |
| `timeouts` | `setup_s`, `ledger_s` (no cursor progress: stalled), `session_s` (cap per attempt) |
| `limits.memory_mb` | the indexer's memory cap; its peak is reported per session |

| Command | Required | Does |
|---|---|---|
| `setup` | no | once per target: build the ref, start the store |
| `prepare` | yes | per session: a clean store with the cursor at `XDRPROOF_FIRST_LEDGER - 1` |
| `start` | yes | per session: run the indexer in the foreground against `XDRPROOF_RPC_URL` |
| `cursor` | yes | print the last ledger the indexer committed |
| `observe` | no | read `{"probes": [...]}` on stdin, write `{"answers": [{id, status, value}]}`; read-only; every probe of a declared kind must be answered `present` or `absent` |
| `stop`, `finish`, `teardown` | no | stop the indexer (optionally print `{"memory_peak_bytes": n}`), drop the session store, clean up |

`status` is `present` (with the stored `value`), `absent`, `unsupported` or `error`. Each command gets
`XDRPROOF_SESSION_ID`, `XDRPROOF_FIRST_LEDGER`, `XDRPROOF_LAST_LEDGER`, `XDRPROOF_NETWORK`,
`XDRPROOF_NETWORK_PASSPHRASE`, `XDRPROOF_RPC_URL` and `XDRPROOF_ARCHIVE_URL` (with `_DOCKER` forms that reach the
host from a container), `XDRPROOF_TARGET`, `XDRPROOF_TARGET_REF`, `XDRPROOF_ADAPTER_WORK` and
`XDRPROOF_MEMORY_MB`. An adapter that implements only `prepare`, `start` and `cursor` still gets `handled`,
`crashed` and `halted` for every ledger.

The wallet-backend adapter builds each ref in a pinned Go image, runs TimescaleDB 2.28.2 (as its compose file
does), copies each session's database from a migrated template, runs `wallet-backend ingest` in live mode
against the mock, and answers probes with one read of the session database.

## Expectations

`expectations/<adapter>@<target>.json` lists every variant that is not `handled` at that target, with its
verdict, the exact probes that failed (by id, so seven wrong balances turning into eight is a change), the cause,
and the upstream issue. It also pins the set of variants judged (their count and the sha256 of their ids) and the
variants reported unsupported, so none can drop out of a run unnoticed. A run must match it exactly: a new
failure, a changed failure and a fixed one all fail `make replay` (exit 1); an adapter or harness failure exits 2.
`--entries` and `--variants` runs check each variant they judge but not the set. `node replay/harness.mjs ... --record` prints the draft
from a measured run; each cause is then written by hand after triage. Failures that let anyone halt or crash an
indexer are handled under [findings/policy.md](../findings/policy.md) before anything is committed.
