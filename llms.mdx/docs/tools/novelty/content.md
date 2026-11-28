# Novelty (/docs/tools/novelty)

**What it is.** A check that every entry earns its place: each must hold something no other entry holds.

**Why it matters.** The corpus grows by purpose, not by volume, so a team can run all of it without wading through duplicates.

```bash
make novelty                    # node tools/novelty.mjs
node tools/novelty.mjs --json out.json   # also write the per-entry report
```

A real run of `make novelty`, recorded 24 Nov 2026:

```text
 XDRPROOF   novelty  · 264 entries · 635 ledger variants

  ╭─ No entry repeats another ────────────────────────── 264/264─╮
  │ ✓ 181 hold an arm, value, hazard or bug of their own         │
  │ ✓ 83 differ only in where it sits in the ledger              │
  ╰──────────────────────────────────────────────────────────────╯

 PASSED   Every entry adds something.   1.9s

  the 83 told apart by where they sit:  make novelty DETAILS=1
```


The corpus grows by purpose, not volume. Novelty checks that every entry earns its place. It describes each entry as a set of **atoms**:

| Atom | What counts |
|---|---|
| Union arms and enum members | those reached by the entry's own transaction (its envelope and result meta) or by its ledger's own shape (header, transaction-set phases, upgrades, evicted keys), in any variant. Other transactions that share the ledger count for nothing |
| Hazards | each hazard the entry targets |
| Sightings | each upstream issue it reproduces |
| Placements | each pair of a hazard and where in the XDR it sits |

An entry is **redundant** when every one of its atoms is also held by some other entry. Each entry is left out in turn, so the result does not depend on the order entries are read, unlike a greedy "does it add anything new" pass. The run exits 1 if any entry is redundant.

## Today

At commit <code>3d6daa17</code>: 0 redundant entries, over 1,231 atoms.

| Entries | Count |
|---|---:|
| Hold an arm, enum member, hazard or sighting no other entry holds | 181 |
| Told apart only by a placement | 83 |
| … of which every other atom sits inside one single other entry | 11 |

<Callout title="Placement is a claim, not a measurement">A placement is text the author wrote. So `make novelty` lists every entry told apart only by placement, and flags the ones wholly contained in one other entry: for each such pair, the facts must check a different thing.</Callout>

It needs Node ≥ 22.15 and the native reader (Rust), which finds each variant's transaction hashes.
