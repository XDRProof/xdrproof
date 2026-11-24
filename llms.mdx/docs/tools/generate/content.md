# Generate (/docs/tools/generate)

**What it is.** Rebuilds every generated ledger from scratch on fresh, offline stellar-cores, twice, and checks that the runs agree.

**Why it matters.** It proves the corpus is reproducible: nothing in it depends on our machine, our timing or our luck.

```bash
make generate        # recipes/regenerate.mjs, about a minute on 10 cores
make generate-quick  # only the two mainnet base P30 pairs, about 15 seconds
```

It needs Docker, Node ≥ 22.15, npm, curl, jq and perl, and host ports 21700–21719. The stellar-core image is pinned by digest in `recipes/core-image`, and every run refuses anything but stellar-core v30.0.0.

## The matrix

`make generate` runs **10 pairs**, which is 20 fresh standalone cores, 6 at a time. There is no RPC and no network: each core is standalone (no peers), with test-only keys committed in the recipes and no real funds.

| Lane | Protocol | Passphrase | Flag profile |
|---|---|---|---|
| Classic | P30 | mainnet, testnet | base |
| Classic | P30 | mainnet | galexie, bare |
| Soroban | P30 | mainnet, testnet | base |
| Soroban | P28 | mainnet, testnet | base |
| Soroban | P30 | mainnet | galexie, bare |

## What must hold

<Steps>
<Step>

### Each pair agrees

The two runs of a pair are compared ledger by ledger. They must be byte-identical, or identical after normalising. Normalising sorts the order of changes within an operation and zeroes the diagnostic `invoke_time_nsecs` timing value.

</Step>
<Step>

### Every shipped variant is reproduced

The list of shipped generated variants is read from `entries/` (`tools/shipped-checks.mjs`), so the testnet and protocol-28 variants are re-checked too. A full run also fails if any shipped variant was not assigned to a pair.

</Step>
<Step>

### The profiles are compared

The same recipe ledgers under the three flag profiles are compared, and the result is recorded in `recipes/<lane>/profiles/p30-mainnet.json`. Every ledger keeps the same header hash; only the metadata changes. See [Found while building](/docs/findings).

</Step>
</Steps>

A real run of `make generate`, recorded 24 Nov 2026:

```text
 XDRPROOF   generate  · 20 fresh runs

  ╭─ Each configuration run twice, the same ────────────── 10/10─╮
  │ ✓ classic P30 mainnet                              reordered │
  │ ✓ soroban P30 mainnet                              reordered │
  │ ✓ classic P30 testnet                              reordered │
  │ ✓ classic P30 mainnet galexie                      reordered │
  │ ✓ classic P30 mainnet bare                         reordered │
  │ ✓ soroban P30 testnet                              reordered │
  │ ✓ soroban P28 mainnet                              reordered │
  │ ✓ soroban P28 testnet                              reordered │
  │ ✓ soroban P30 mainnet galexie                      reordered │
  │ ✓ soroban P30 mainnet bare                         reordered │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Corpus ledgers made again ───────────────────────── 597/597─╮
  │ ✓ every generated ledger in the corpus, from scratch         │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Emitter flag profiles ───────────────────────────────── 2/2─╮
  │ ✓ classic: the same ledgers under 3 flag sets        104/104 │
  │ ✓ soroban: the same ledgers under 3 flag sets          93/93 │
  ╰──────────────────────────────────────────────────────────────╯

 PASSED   Every generated ledger was made again from scratch.   47s

  ledger counts per pair:  make generate DETAILS=1
```
