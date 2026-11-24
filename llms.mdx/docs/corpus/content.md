# The corpus (/docs/corpus)

**What it is.** The heart of XDRProof: real Stellar ledgers in their rarest valid shapes, each kept as the exact bytes stellar-core wrote, with the answers a correct reader must give.

**Why it matters.** Your code meets ordinary ledgers every day and these rarely, often for the first time in production. The corpus lets you meet them in a test.

264 entries · 635 variants · 78 hazards in the registry · 72 hazards covered so far

The corpus is a set of **entries**, plus [37 mined ledgers](/docs/corpus/mined) from the real networks. Each entry is one rare shape, such as a signed-payload signer or a trustline created by a contract call, kept as real `LedgerCloseMeta` bytes. Each entry also carries the facts a correct reader must find in those bytes.

Entries grow by purpose, not by volume. Each one names the [hazards](/docs/hazards) it targets, and where in the XDR they sit.

The full list, grouped by family, is on [All entries](/docs/corpus/entries); every entry has its own page.

## How an entry is built

<Steps>
<Step>

### Picked from the hazard registry

A hazard is a named way readers break, with its evidence: an upstream issue, a protocol rule or a measurement. An entry targets one or more hazards, and says where each sits in the XDR (its `placement`).

</Step>
<Step>

### Written in the catalog, compiled from real runs

The entry's intent and facts are written in its [catalog file](/docs/corpus/catalog). The compiler takes the bytes from a recipe run of a bare standalone stellar-core, or from a ledger **mined** from public history, and resolves every fact against them. A fact that doesn't hold fails the build. `make generate` re-runs every recipe twice from scratch and checks that every shipped generated variant is reproduced: the same bytes, or the same content in another change order.

</Step>
<Step>

### Facts, and what backs each one

Every expected value says what backs it: `construction` (the recipe set that value), `snapshot` (the SEP-0051 rendering by the pinned stellar-xdr crate), `core` (stellar-core's own decoder), `walker` (XDRProof's schema walker) or `review`. 741 of the 1,302 facts are also confirmed by both stellar-core's decoder and the schema walker; the **Backed by** column on each entry page shows exactly which.

</Step>
<Step>

### Verified on every change

`make verify` checks the schema, sizes and hashes, a byte-for-byte round trip through native rs-stellar-xdr, the focus transaction and every fact. `make oracle` checks that each fact's values also appear in what stellar-core's own decoder and the schema walker read.

</Step>
</Steps>

## Files

<Files>
  <Folder name="catalog" defaultOpen>
    <File name="<id>.json" />
  </Folder>
  <Folder name="entries" defaultOpen>
    <Folder name="<id>" defaultOpen>
      <File name="entry.json" />
      <File name="p30-mainnet-generated.xdr" />
      <File name="p28-testnet-generated.xdr" />
    </Folder>
  </Folder>
  <Folder name="mined/ledgers" />
  <File name="manifest.json" />
  <Folder name="schema/v1">
    <File name="entry.schema.json" />
  </Folder>
</Files>

`manifest.json` is generated from the entries, one row per variant. `make verify` fails if it is out of date.
