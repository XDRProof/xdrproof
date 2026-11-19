#!/usr/bin/env node
// XDRProof corpus verifier.
//
// For every entries/<id>/entry.json it checks, offline:
//   1. the sidecar against schema/v1/entry.schema.json (JSON Schema 2020-12, ajv strict), and that
//      every hazard it names exists in caps/registry.json;
//   2. each variant's size and sha256 (of the decompressed bytes for .xdr.zst variants);
//   3. the RFP's round-trip check with NATIVE rs-stellar-xdr 30.0.0 (tools/native, depth limit 1500):
//      decode, re-encode, bytes identical;
//   4. that the variant's focus transaction is in the ledger;
//   5. every expected fact against the decoded SEP-0051 JSON (order-independent where stellar-core's
//      change order is not stable);
//   6. for variants whose change order varies between core runs: the order-normalised hash, and every
//      shipped ordering file;
//   7. a second reader, the official WASM build (@stellar/stellar-xdr-json): it must agree with the
//      native JSON wherever it can decode; where it cannot, the failure is reported (a known finding:
//      its depth limit rejects ledgers stellar-core accepted).
// Then it builds manifest.json (one row per variant) and fails if the committed copy drifted.
//
// usage: node tools/verify.mjs [--write]
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { zstdDecompressSync } from 'node:zlib';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { sha256, stable, pointer, checkFact, normalise, decodeWasm as wasmDecode } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const read = (p) => readFileSync(join(ROOT, p));
const bytesOf = (file) => (file.endsWith('.zst') ? zstdDecompressSync(readFileSync(file)) : readFileSync(file));

if (!existsSync(NATIVE)) {
  console.error('Native reader not built. Run: cargo build --release --manifest-path tools/native/Cargo.toml (or: make native)');
  process.exit(2);
}
// One long-lived native reader process; requests and responses are line-delimited JSON.
const native = spawn(NATIVE, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const waiting = new Map();
createInterface({ input: native.stdout }).on('line', (line) => { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); });
let nextId = 0;
const nativeDecode = (type, bytes) => new Promise((resolve) => {
  const id = String(nextId++); waiting.set(id, resolve);
  native.stdin.write(JSON.stringify({ id, type, xdr: Buffer.from(bytes).toString('base64') }) + '\n');
});

// Transaction hashes present in a LedgerCloseMeta (outer and, for fee bumps, inner).
function txHashes(doc) {
  const v = doc[Object.keys(doc)[0]];
  const hashes = new Set();
  for (const tp of v.tx_processing ?? []) {
    hashes.add(tp.result.transaction_hash);
    const r = tp.result.result.result;
    const inner = r?.tx_fee_bump_inner_success ?? r?.tx_fee_bump_inner_failed;
    if (inner?.transaction_hash) hashes.add(inner.transaction_hash);
  }
  return hashes;
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(read('schema/v1/entry.schema.json')));
const registry = new Set(JSON.parse(read('caps/registry.json')).hazards.map((h) => h.id));

const failures = [];
const rows = [];
const wasmDisagreements = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
const hazardsSeen = new Set();

const ids = readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort();
for (const id of ids) {
  const dir = join(ROOT, 'entries', id);
  const entryPath = join(dir, 'entry.json');
  if (!existsSync(entryPath)) { fail(id, 'missing entry.json'); continue; }
  const entry = JSON.parse(readFileSync(entryPath, 'utf8'));
  if (!validate(entry)) { fail(id, 'schema: ' + ajv.errorsText(validate.errors)); continue; }
  if (entry.id !== id) fail(id, `id "${entry.id}" does not match its directory`);
  for (const h of entry.hazards) { if (!registry.has(h.id)) fail(id, `hazard ${h.id} is not in caps/registry.json`); else hazardsSeen.add(h.id); }
  const keys = new Set();
  for (const v of entry.variants) {
    const where = `${id}@${v.key}`;
    if (keys.has(v.key)) fail(where, 'duplicate variant key');
    keys.add(v.key);
    if (!v.file.startsWith(v.key)) fail(where, 'file name must start with the variant key');
    const file = join(dir, v.file);
    if (!existsSync(file)) { fail(where, `missing ${v.file}`); continue; }
    const bytes = bytesOf(file);
    const digest = sha256(bytes);
    if (bytes.length !== v.size) fail(where, `size ${bytes.length} != ${v.size}`);
    if (digest !== v.sha256) fail(where, `sha256 ${digest} != ${v.sha256}`);

    const r = await nativeDecode(entry.xdr_type, bytes);
    if (r.status !== 'ok') { fail(where, `native rs-stellar-xdr ${r.stage} failed: ${r.message}`); continue; }
    if (!r.identical) fail(where, 'round trip through rs-stellar-xdr changed the bytes');
    const doc = r.json;

    if (v.focus.tx_hash && !txHashes(doc).has(v.focus.tx_hash)) fail(where, `focus transaction ${v.focus.tx_hash} is not in this ledger`);

    let facts = 0;
    for (const f of entry.expected.facts) {
      if (f.variants && !f.variants.includes(v.key)) continue;
      const why = checkFact(f, doc);
      if (why) fail(where, `fact "${f.says}": ${why}`); else facts += 1;
    }

    if (v.change_order) {
      const normalized = sha256(stable(normalise(doc)));
      if (normalized !== v.change_order.normalized_sha256) fail(where, `normalised sha256 ${normalized} != ${v.change_order.normalized_sha256}`);
      if (!v.change_order.raw.some((o) => o.sha256 === digest)) fail(where, 'shipped bytes are not among the observed orderings');
      for (const o of v.change_order.raw.filter((x) => x.file)) {
        const ob = bytesOf(join(dir, o.file));
        if (sha256(ob) !== o.sha256) fail(where, `ordering file ${o.file} sha256 mismatch`);
        const od = await nativeDecode(entry.xdr_type, ob);
        if (od.status !== 'ok' || sha256(stable(normalise(od.json))) !== v.change_order.normalized_sha256) fail(where, `ordering file ${o.file} is not the same content`);
      }
    }

    let wasm = 'agrees';
    try { if (stable(JSON.parse(wasmDecode(entry.xdr_type, bytes))) !== stable(doc)) { wasm = 'DIFFERENT JSON'; fail(where, 'WASM and native readers render different JSON'); } }
    catch (e) { wasm = `fails: ${String(e.message ?? e).slice(0, 60)}`; wasmDisagreements.push(`${where}: ${wasm}`); }

    rows.push({
      entry_id: `${id}@${v.key}`,
      id, variant: v.key, caps: entry.caps, hazards: entry.hazards.map((h) => h.id), protocol: v.protocol,
      network_passphrase: v.network_passphrase,
      source: v.source.lane, synthetic: v.synthetic,
      xdr_type: entry.xdr_type, file: `entries/${id}/${v.file}`, sha256: v.sha256, size: v.size,
      focus: v.focus,
      facts_checked: facts, sdk_checks: entry.expected.sdk_checks?.length ?? 0,
      change_order_stable: v.change_order ? v.change_order.stable : true,
      sightings: entry.sightings ?? [], channel: entry.channel, status: entry.status,
      wasm_reader: wasm === 'agrees' ? 'agrees' : 'fails',
    });
  }
}
native.stdin.end();

const manifest = {
  schema: 'https://xdrproof.dev/schema/v1/entry.schema.json',
  note: 'GENERATED by tools/verify.mjs --write. One row per variant. Do not edit by hand.',
  entries: ids.length,
  variants: rows.length,
  hazards_covered: [...hazardsSeen].sort(),
  rows,
};
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
const manifestPath = join(ROOT, 'manifest.json');
if (WRITE) writeFileSync(manifestPath, manifestText);
else if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) fail('manifest.json', 'out of date; run: node tools/verify.mjs --write');

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('entry@variant', 68)} ${pad('protocol', 9)} ${pad('source', 10)} ${pad('round trip', 11)} ${pad('facts', 6)} wasm reader`);
for (const r of rows) {
  const bad = failures.some((f) => f.startsWith(r.entry_id));
  console.log(`${pad(r.entry_id, 68)} ${pad('P' + r.protocol, 9)} ${pad(r.source, 10)} ${pad(bad ? 'see below' : 'identical', 11)} ${pad(r.facts_checked, 6)} ${r.wasm_reader}`);
}
console.log(`\n${ids.length} entries, ${rows.length} variants, ${hazardsSeen.size} of ${registry.size} hazards targeted. Reader: native rs-stellar-xdr 30.0.0 (depth 1500).`);
if (wasmDisagreements.length) {
  console.log(`Second reader @stellar/stellar-xdr-json (WASM) could not decode ${wasmDisagreements.length} variant(s) that stellar-core produced:`);
  for (const w of wasmDisagreements) console.log('  - ' + w);
}
if (failures.length) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('OK: schema valid, hazards known, sha256 and sizes match, every variant round-trips byte-for-byte natively, focus present, every fact holds' + (WRITE ? ', manifest written.' : ', manifest up to date.'));
