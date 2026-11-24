# Replay your indexer (/docs/use/replay)

**What it is.** A way to feed every rare ledger in the corpus into your own indexer, the way an RPC would serve it, and get a verdict for each one: handled, dropped, mishandled, stalled, crashed or halted.

**Why it matters.** It is the closest thing to meeting those ledgers in production, without waiting for them. The verdict comes from your indexer's own state, so a wrong balance is caught even when nothing crashes.

Figure: how a replay works. A corpus ledger is served by a mock stellar-rpc to a real indexer build with its own database; what it did (its cursor, its process, the rows it stored) is compared with probes derived from the same ledger, which gives a verdict: handled, dropped, mishandled, stalled, crashed or halted.

## Try it on wallet-backend first

The replay harness runs from the repository today, so this one needs a clone, with Docker and Node 22.15 or later. The planned `xdrproof` command-line tool (Tranche 1, by 2 February 2027) brings `xdrproof replay` without one.

```bash
git clone --depth 1 https://github.com/XDRProof/xdrproof && cd xdrproof
make tools/node_modules native
node replay/harness.mjs --adapter wallet-backend --target main \
  --entries muxed.payment.every-position
```

A real run, with the Docker images already on this machine (a first run also downloads them and builds wallet-backend, a few minutes; each step says so on its live row):

A real run of `node replay/harness.mjs --adapter wallet-backend --target main --entries muxed.payment.every-position`, recorded 24 Nov 2026:

```text
 XDRPROOF   replay  · wallet-backend · 2 variants

  ╭─ wallet-backend main · 76194899 ──────────────────────── 2/2─╮
  │ ✓ 2 handled                                                  │
  │ report: replay/runs/wallet-backend@main/report.json          │
  ╰──────────────────────────────────────────────────────────────╯

  The indexer read 4 ledger entries the corpus does not hold; the mock
  answered "not found".

 PASSED   Every ledger handled.   16s
```

Before any session counts, one control ledger for each protocol the target decodes must get through; if one does not, the run stops, because the setup is wrong, not the indexer. When the indexer asks the mock for state the ledger does not hold (wallet-backend reads two Blend contracts at startup), the run says so under the cards, and a verdict that depends on such a read is traced by hand. Drop `--entries` to replay the whole corpus.

## Write an adapter for your indexer

An adapter is a folder under `replay/adapters/` with an `adapter.toml` and a few commands. Any indexer that reads ledgers through `getLedgers` can join. Below is a starting template, cut down from wallet-backend's adapter; fill in your own commands.

```toml title="replay/adapters/your-indexer/adapter.toml"
schema = "xdrproof.adapter/v1"
name   = "your-indexer"

[delivery]
kind = "rpc"   # ledgers come through a mock stellar-rpc

[supports]
networks = ["pubnet", "testnet"]
# the probe kinds your observe command answers
probes   = ["tx.present", "balance.native"]

[targets.main]
ref = "<commit>"      # the commit to build
protocol_max = 30     # the newest protocol its decoder reads

[commands]                  # run from the adapter folder
prepare = "./prepare.sh"    # a clean store, cursor before the ledger
start   = "./start.sh"      # the indexer, pointed at XDRPROOF_RPC_URL
cursor  = "./cursor.sh"     # print the last ledger committed
observe = "node observe.mjs" # optional: answer probes, read-only

[timeouts]
setup_s = 1200
ledger_s = 30
session_s = 120

[limits]
memory_mb = 1024
```

| Command | Required | Does |
|---|---|---|
| `setup` | no | once per target: build the commit, start the store |
| `prepare` | yes | per session: a clean store with the cursor just before the ledger |
| `start` | yes | per session: run the indexer in the foreground against the mock RPC |
| `cursor` | yes | print the last ledger the indexer committed |
| `observe` | no | read `{"probes": [...]}` on stdin and answer each one `present` (with the stored value) or `absent`, read-only |
| `stop`, `finish`, `teardown` | no | stop the indexer, drop the session's store, clean up |

Each command gets the session in its environment: `XDRPROOF_FIRST_LEDGER`, `XDRPROOF_LAST_LEDGER`, `XDRPROOF_NETWORK_PASSPHRASE`, `XDRPROOF_RPC_URL` (and a `_DOCKER` form that reaches the host from a container), `XDRPROOF_TARGET_REF` and more; the full list is in [`replay/README.md`](https://github.com/XDRProof/xdrproof/blob/main/replay/README.md#adapter-contract).

With only `prepare`, `start` and `cursor`, every ledger already gets `handled`, `crashed` or `halted`. Add `observe` and the harness can also tell `dropped` and `mishandled`: it works out probes from the ledger's own meta (transactions, participants, signers, trustlines, balances, contracts) and asks your store about each one.

The worked example is [`replay/adapters/wallet-backend/`](https://github.com/XDRProof/xdrproof/tree/main/replay/adapters/wallet-backend): it builds each commit in a pinned Go image, runs TimescaleDB as wallet-backend's compose file does, copies each session's database from a migrated template, and answers every probe with one read of the session database. Its `cursor.sh` is one SQL query.

## What a verdict means

Each ledger gets two attempts: if the first does not get past it, the indexer is restarted once on the same store.

| Verdict | Means |
|---|---|
| `handled` | the cursor passed the ledger and every probe your adapter answers matches it |
| `dropped` | the cursor passed, and something the ledger states is not stored |
| `mishandled` | the cursor passed, and a stored value differs from the ledger, or an invariant fails |
| `stalled` | the first attempt stopped making progress without exiting; the restart got past the ledger |
| `crashed` | the first attempt exited on the ledger; the restart got past it |
| `halted` | neither attempt got past the ledger: ingestion is stuck |

Two more statuses are not findings: `unsupported` (the ledger's protocol is newer than your target decodes, or its network is not supported) and `error` (an adapter command failed; the run exits 2).

See [Replay](/docs/tools/replay) for how sessions, probes and expectations work, and for wallet-backend's results across the whole corpus.
