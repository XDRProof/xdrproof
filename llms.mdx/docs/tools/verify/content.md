# Verify (/docs/tools/verify)

**What it is.** The basic check: every entry is exactly what it says it is, byte for byte, and every expected fact holds.

**Why it matters.** If the corpus were wrong, every test built on it would be wrong too. This runs in seconds, so it runs on every change.

```bash
make verify
# runs, with node: tools/strkey.test.mjs, tools/verify.mjs,
# tools/mined-verify.mjs and tools/auth-payload-check.mjs
node tools/verify.mjs --write   # also rewrite manifest.json
```

A real run of `make verify`, recorded 24 Nov 2026:

```text
 XDRPROOF   verify  · 263 entries · 634 ledger variants

  ╭─ Second reader · stellar-xdr-json ────────────────── 621/634─╮
  │ ! refuses very deep auth trees                           #67 │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Corpus ──────────────────────────────────────────── 634/634─╮
  │ ✓ entries match the schema and the hazard list           263 │
  │ ✓ files match their sha256 and size                      634 │
  │ ✓ ledgers read back byte for byte                        634 │
  │ ✓ every focus transaction is in its ledger               634 │
  │ ✓ expected values hold                                 1,715 │
  │ ✓ ledgers with shuffled change order match                88 │
  │ ✓ manifest.json is up to date                                │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Mined pubnet ledgers ──────────────────────────────── 37/37─╮
  │ ✓ 47 records and 223 values match the ledgers                │
  ╰──────────────────────────────────────────────────────────────╯
  ╭─ Keys and signatures ───────────────────────────────── 39/39─╮
  │ ✓ strkeys: 10 valid accepted, 19 invalid refused          29 │
  │ ✓ auth signatures hold (H-B16)                            10 │
  ╰──────────────────────────────────────────────────────────────╯

 PASSED   The corpus is intact.   12s

  every refused ledger and the hazards:  make verify DETAILS=1
```

## What it checks

<Steps>
<Step>

### Strkeys

Every SEP-0023 test vector must decode and re-encode (valid), or be rejected (invalid). This covers XDRProof's own strkey codec, which the schema walker uses.

</Step>
<Step>

### The entry

The entry is validated against `schema/v1/entry.schema.json` (ajv, strict mode). Its `id` must match its directory, and every hazard id must exist in the registry. Variant keys must be unique, and each file name must start with its key.

</Step>
<Step>

### The bytes and the round trip

Size and sha256 must match; `.zst` variants are checked on their decompressed bytes. The **native reader** (rs-stellar-xdr 30.0.0, depth limit 1500) decodes the bytes, renders SEP-0051 JSON and encodes them again. The result must be identical, byte for byte.

</Step>
<Step>

### The focus and the facts

The focus transaction hash must be in the ledger, as an outer or fee-bump inner hash. Every fact that applies to the variant must hold at its JSON Pointer path. If the entry's change order is unstable, the order-normalised hash must match, and the shipped bytes must be one of the orderings seen.

</Step>
<Step>

### A second reader

The WASM build `@stellar/stellar-xdr-json` 30.0.0 decodes each variant again, with no fallback. If it renders different JSON, the run fails. If it cannot decode a variant at all (for example at its depth limit), verify lists it and records `fails` in the manifest, and the run still passes. Today 621 of 634 variants agree.

</Step>
<Step>

### The manifest

`manifest.json` is rebuilt from the entries. Without `--write`, verify fails if the committed file has drifted.

</Step>
<Step>

### The mined ledgers

`tools/mined-verify.mjs` checks every [mined ledger](/docs/corpus/mined). It must match its hash and size, round-trip through the native reader, and carry the recorded sequence and protocol. Every finding's transaction and JSON path must be present.

</Step>
<Step>

### The create-contract authorization payload

For the two v1 create-contract entries, `tools/auth-payload-check.mjs` encodes each authorization preimage by hand twice, once as the entry's own bytes and once as the V2 rendering the host hashes, and verifies the ed25519 signature against both. The entry stellar-core accepted verifies only as V2; the one signed over its own bytes verifies only as v1, and core failed it. No SDK or host code is involved. See hazard [H-B16](/docs/hazards/layer-b#h-b16).

</Step>
</Steps>

## Output

A table with one row per variant: entry@variant, protocol, source, round trip, facts, WASM reader. Then a summary of the counts (entries, variants, hazards targeted), an `OK` line, and the mined-ledger report.
