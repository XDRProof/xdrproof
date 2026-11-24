# Oracle (/docs/tools/oracle)

**What it is.** A second and a third opinion on every expected value, from two readers that share no code with any SDK: stellar-core's own decoder and XDRProof's own walker.

**Why it matters.** A test is only as good as its expected answer. Readers that cannot share a bug with the SDK under test keep the answers honest.

```bash
make oracle          # node tools/oracle.mjs
node tools/oracle.mjs --write  # also writes the evidence into entries
```

A real run of `make oracle`, recorded 24 Nov 2026:

```text
 XDRPROOF   oracle  · 264 entries · 635 ledgers · 1,302 facts

  ╭─ stellar-core's own decoder ──────────────────────── 741/741─╮
  │ ✓ found every fact in its printout                           │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Schema walker ───────────────────────────────────── 741/741─╮
  │ ✓ found every fact in the ledger                             │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Planted errors (one digit changed) ────────────────── 51/51─╮
  │ ✓ 51 rejected by both readers                                │
  ╰──────────────────────────────────────────────────────────────╯

  561 facts have no value to check (a length or a structure); make
  verify checks those at their exact place.

 PASSED   Every fact is confirmed by two readers.   11s

  each entry, fact by fact:  make oracle DETAILS=1
```


A fact is only as good as the reader that produced it. The oracle asks two readers that share no code with any SDK:

| Reader | How it runs |
|---|---|
| **stellar-core** | `stellar-core dump-xdr`, inside `docker run --network none` on the `stellar/quickstart` image pinned by digest in `recipes/core-image` (override with `XDRPROOF_CORE_IMAGE`) |
| **Schema walker** | `tools/walker.mjs`, driven only by the v30.0 XDR definitions. It rejects non-zero padding, over-length values, bad enums and trailing bytes |

For each fact, the oracle takes its expected values and checks that they appear among the values each reader produced. Enum values are checked too: `tools/coverage/defs/sep0051-enum-names.json` maps every XDR enum member to the string SEP-0051 prints for it, so the walker confirms a member it reached and stellar-core one its dump printed. Enum names are matched by name across all enums, anywhere in the ledger, so a common name such as `success` is a weak confirmation. A `length` fact has no value to check, and a `v0`-style arm name is structure, not a value. A value either reader misses is a **disagreement**, and the run fails. So does a ledger stellar-core cannot print: nothing in it is confirmed. With `--write`, it records `core` and `walker` in the fact's evidence.

## A planted error must be caught

A reader that finds every value might simply accept anything. So the oracle tests itself. It takes every expected value of 10 or more digits (64-bit amounts, IDs and fees), changes its last digit and asks both readers again.

| Result | Counts as |
|---|---|
| Both readers reject the changed value | caught |
| Both readers find it: the changed value occurs elsewhere in the same ledger | a coincidence, not a failure |
| Only one reader finds it | a **disagreement**: the run fails |

If no planted error is caught at all, the self-test fails and the run exits 1.

<Callout title="What it does not check">It checks that a value is present in a reader's output, not that it sits at the fact's path; the path is checked by [Verify](/docs/tools/verify).</Callout>
