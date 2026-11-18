#!/usr/bin/env node
// build.mjs [id ...]: compile catalog/<id>.json into entries/<id>/ (format: catalog/README.md).
// Needs the runs of a fresh `make generate` (recipes/<lane>/runs/g-*) and, for the base P30 mainnet variants,
// the order scan's runs and report (`make order-scan`). Every fact is resolved to an exact JSON Pointer per
// variant and must hold there, or the build fails: intent and outcome must agree before an entry exists.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { sha256, stable, pointer, normalisedSha256 } from './lib.mjs';
import * as K from './strkey.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const PASSPHRASE = { mainnet: 'Public Global Stellar Network ; September 2015', testnet: 'Test SDF Network ; September 2015' };
const MINED = JSON.parse(readFileSync(join(ROOT, 'mined/index.json'), 'utf8'));
const MINOR_FILES = 2; // minority byte orderings shipped as files per variant (all are listed by sha256)
const die = (m) => { throw new Error(m); };

// ---- native reader: decode + transaction hashes in transaction-set order -----------------------
function native(bytes, passphrase) {
  const b64 = bytes.toString('base64'), nid = createHash('sha256').update(passphrase).digest('hex');
  const out = execFileSync(NATIVE, { input: JSON.stringify({ id: 'd', type: 'LedgerCloseMeta', xdr: b64 }) + '\n' + JSON.stringify({ id: 'h', op: 'tx_hashes', xdr: b64, network_id: nid }) + '\n', maxBuffer: 2 ** 31 })
    .toString().trim().split('\n').map(JSON.parse);
  if (out[0].status !== 'ok' || !out[0].identical) die('native decode/round trip failed');
  if (out[1].status !== 'ok') die('native tx hashes failed: ' + out[1].message);
  return { json: out[0].json, hashes: out[1].hashes };
}
// envelope pointers in the same order the native tool lists the transaction set
function envelopePointers(json) {
  const arm = Object.keys(json)[0], ts = json[arm].tx_set, out = [];
  if (arm === 'v0') { ts.txs.forEach((_, k) => out.push(`/v0/tx_set/txs/${k}`)); return out; }
  ts.v1.phases.forEach((ph, p) => {
    if (ph.v0) ph.v0.forEach((c, ci) => c.txset_comp_txs_maybe_discounted_fee.txs.forEach((_, k) => out.push(`/${arm}/tx_set/v1/phases/${p}/v0/${ci}/txset_comp_txs_maybe_discounted_fee/txs/${k}`)));
    else ph.v1.execution_stages.forEach((st, s) => st.forEach((cl, c) => cl.forEach((_, k) => out.push(`/${arm}/tx_set/v1/phases/${p}/v1/execution_stages/${s}/${c}/${k}`))));
  });
  return out;
}

// ---- variant sources ------------------------------------------------------------------------------
const parseLabel = (l) => { const m = l.match(/^p(\d+)-(mainnet|testnet)(?:-([a-z0-9]+))?$/) ?? die(`bad variant label ${l}`); return { proto: Number(m[1]), net: m[2], flags: m[3] ?? 'base' }; };
const runDir = (lane, { proto, net, flags }, r) => join(ROOT, 'recipes', lane, 'runs', `g-${lane}-p${proto}-${net}-${flags}-${r}`);
const flagList = (lane, flags) => [...readFileSync(join(ROOT, 'recipes/flags', flags + '.cfg'), 'utf8').split('\n').filter((l) => /^[A-Z_]+=true$/.test(l)).map((l) => l.split('=')[0]),
  ...(lane === 'soroban' ? ['TESTING_SOROBAN_HIGH_LIMIT_OVERRIDE'] : [])];
const findStep = (manifest, step) => {
  for (const s of manifest.steps ?? []) {
    if (s.name === step && s.tx) return { ledger: s.ledger, tx: s.tx };
    if (s.name === step && !s.tx && !s.txs) return { ledger: s.ledger, tx: null };
    for (const t of s.txs ?? []) if (t.label === step) return { ledger: s.ledger, tx: t.tx };
  }
  die(`step ${step} not in manifest`);
};
const manifestValue = (m, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), m) ?? die(`$manifest ${path} missing`);

function generatedVariant(cat, label) {
  const lane = cat.source.lane, cfg = parseLabel(label), d1 = runDir(lane, cfg, 1), d2 = runDir(lane, cfg, 2);
  if (!existsSync(d1)) die(`run ${d1} missing: run make generate`);
  const manifest = JSON.parse(readFileSync(join(d1, 'manifest.json'), 'utf8'));
  // source.ledger_offset: the entry is about a ledger N after the step's (e.g. the eviction minPersistentTTL ledgers later)
  const at = findStep(manifest, cat.source.step); const off = cat.source.ledger_offset ?? 0;
  const ledger = at.ledger + off, tx = off || cat.focus?.ledger ? null : at.tx;
  const file = `ledger-${String(ledger).padStart(3, '0')}.xdr`; let bytes = readFileSync(join(d1, 'lcm', file));
  const key = `p${cfg.proto}-${cfg.net}-generated${cfg.flags === 'base' ? '' : '-' + cfg.flags}`;
  // change order: 20-run scan for base P30 mainnet, else the two matrix runs
  const norm = normalisedSha256('LedgerCloseMeta', bytes); let change_order, minority = [];
  const scanFile = join(ROOT, 'recipes', lane, 'order-scan', `p${cfg.proto}-${cfg.net}-${cfg.flags}.json`);
  const scan = existsSync(scanFile) ? JSON.parse(readFileSync(scanFile, 'utf8')) : null;
  const row = scan?.ledgers.find((l) => l.ledger === ledger);
  if (row) {
    if (row.normalized_sha256 !== norm) die(`${cat.id}@${key}: run bytes do not match the order scan's content`);
    change_order = { stable: row.stable, normalized_sha256: norm, runs: scan.runs, raw: row.raw.map((r) => ({ ...r })) };
    // the scan lists orderings most frequent first (ties by sha256): ship the first, and the next ones as files
    const pool = [join(d1, 'lcm', file), join(d2, 'lcm', file), ...readdirSync(join(ROOT, 'recipes', lane, 'runs'))
      .filter((n) => n.startsWith(`os-p${cfg.proto}-${cfg.net}-${cfg.flags}-`)).sort().map((n) => join(ROOT, 'recipes', lane, 'runs', n, 'lcm', file))].filter(existsSync);
    const bytesOf = (sha) => { const f = pool.find((p) => sha256(readFileSync(p)) === sha); return f ? readFileSync(f) : null; };
    bytes = bytesOf(change_order.raw[0].sha256) ?? die(`${cat.id}@${key}: the most frequent ordering's bytes are not in any run; run make order-scan`);
    for (const r of change_order.raw.slice(1, 1 + MINOR_FILES)) {
      const b = bytesOf(r.sha256); if (b) { r.file = `${key}.order-${minority.length + 1}.xdr`; minority.push([r.file, b]); }
    }
  } else {
    const b2 = readFileSync(join(d2, 'lcm', file));
    if (normalisedSha256('LedgerCloseMeta', b2) !== norm) die(`${cat.id}@${key}: the two runs differ in content`);
    const raws = [...new Set([sha256(bytes), sha256(b2)])];
    change_order = { stable: raws.length === 1, normalized_sha256: norm, runs: 2, raw: raws.map((s) => ({ sha256: s, runs: [bytes, b2].filter((x) => sha256(x) === s).length })) };
  }
  return { key, label, protocol: cfg.proto, passphrase: PASSPHRASE[cfg.net], bytes, fileName: `${key}.xdr`, tx, manifest, minority,
    source: { lane: 'generated', core_version: 'stellar-core v30.0.0', emitter_flags: flagList(lane, cfg.flags), ledger_seq: ledger, recipe: `recipes/${lane}/${lane === 'classic' ? 'gen.mjs' : 'gen/gen.mjs'}#${cat.source.step}` },
    change_order };
}

function minedVariant(cat, ref) { // ref: a mined record id, or {record, key} to keep a published variant key
  const recId = typeof ref === 'string' ? ref : ref.record;
  const rec = MINED.find((r) => r.id === recId) ?? die(`mined record ${recId} missing`);
  const net = rec.network === 'pubnet' ? 'mainnet' : 'testnet';
  const bytes = zstdDecompressSync(readFileSync(join(ROOT, rec.file)));
  const key = typeof ref === 'string' ? `p${rec.protocol_version}-${net}-mined-l${rec.ledger_seq}` : ref.key;
  // the catalog states the focus: a transaction, or the ledger itself; never a transaction picked from the record
  const tx = cat.focus?.ledger ? null : (typeof ref === 'object' && ref.tx_hash) || cat.focus?.tx_hash || die(`${cat.id}: mined variant ${recId} needs a tx_hash (focus.tx_hash, or tx_hash on the source.mined reference) or focus.ledger`);
  return { key, protocol: rec.protocol_version, passphrase: PASSPHRASE[net], bytes, fileName: `${key}.xdr.zst`, zst: readFileSync(join(ROOT, rec.file)), tx, manifest: {},
    source: { lane: 'mined', ledger_seq: rec.ledger_seq, url: rec.source.lake_url, container_sha256: rec.source.batch_sha256 }, // full provenance: mined/index.json
    change_order: null, minority: [] };
}

// ---- fact resolution ----------------------------------------------------------------------------------
function anchor(v, json, at) {
  const arm = Object.keys(json)[0], L = json[arm];
  if (at === 'ledger') return `/${arm}`;
  if (!v.tx) die(`fact at ${at} needs a focus transaction`);
  const i = L.tx_processing.findIndex((tp) => tp.result.transaction_hash === v.tx);
  if (i < 0) die(`focus tx ${v.tx} not in tx_processing`);
  const tp = `/${arm}/tx_processing/${i}`, metaArm = Object.keys(L.tx_processing[i].tx_apply_processing)[0];
  const op = (rest) => `${tp}/tx_apply_processing/${metaArm}/operations/${v.opIndex}${rest}`;
  switch (at) {
    case 'tx.result_pair': return `${tp}/result`;
    case 'tx.result': return `${tp}/result/result/result`;
    case 'tx.fee_charged': return `${tp}/result/result/fee_charged`;
    case 'tx.meta': return `${tp}/tx_apply_processing/${metaArm}`;
    case 'tx.fee_processing': return `${tp}/fee_processing`;
    case 'tx.post_apply_fee': return `${tp}/post_tx_apply_fee_processing`;
    case 'tx.envelope': { const k = v.hashes.indexOf(v.tx); if (k < 0) die('focus tx not in transaction set'); return v.envPtrs[k]; }
    case 'op.meta': return op('');
    case 'op.changes': return op('/changes');
    case 'op.events': return op('/events');
    default: die(`unknown fact address ${at}`);
  }
}
// {"$manifest": "a.b.c"}: a value from the run's manifest; {"$step": "<name>"}: that recipe step's transaction hash;
// {"$muxedContract": ["<manifest path of a C... id>", "<id>"]}: the W... strkey, computed by tools/strkey.mjs
const resolveValue = (val, manifest) => (val && typeof val === 'object' && !Array.isArray(val)
  ? ('$manifest' in val ? manifestValue(manifest, val.$manifest)
    : '$muxedContract' in val ? K.muxedContract(K.decode(manifestValue(manifest, val.$muxedContract[0])).payload, BigInt(val.$muxedContract[1])) : '$step' in val ? findStep(manifest, val.$step).tx ?? die(`$step ${val.$step} has no tx`)
    : Object.fromEntries(Object.entries(val).map(([k, x]) => [k, resolveValue(x, manifest)])))
  : Array.isArray(val) ? val.map((x) => resolveValue(x, manifest)) : val);
function check(json, fact) {
  const at = pointer(json, fact.path);
  if ('equals' in fact) return stable(at) === stable(fact.equals) ? null : `expected ${stable(fact.equals).slice(0, 120)}, got ${stable(at)?.slice(0, 120)}`;
  if ('length' in fact) return (Array.isArray(at) ? at.length : at && typeof at === 'object' ? Object.keys(at).length : -1) === fact.length ? null : `expected length ${fact.length}`;
  if ('some' in fact) return Array.isArray(at) && at.some((el) => Object.entries(fact.some).every(([p, w]) => stable(pointer(el, p)) === stable(w))) ? null : `no element matches ${stable(fact.some).slice(0, 160)}`;
  return 'fact has no equals/length/some';
}

// ---- build one entry -------------------------------------------------------------------------------
function build(cat) {
  const variants = [
    ...(cat.source.lane === 'mined' ? [] : (cat.source.variants ?? die('source.variants required')).map((l) => generatedVariant(cat, l))),
    ...(cat.source.mined ?? (cat.source.lane === 'mined' ? [cat.source.step] : [])).map((r) => minedVariant(cat, r)),
  ];
  const resolved = [];
  for (const v of variants) {
    const { json, hashes } = native(v.bytes, v.passphrase);
    v.hashes = hashes; v.envPtrs = envelopePointers(json); v.opIndex = cat.focus?.op_index ?? 0;
    if (Boolean(cat.focus?.ledger) === Boolean(v.tx)) die(`${cat.id}@${v.key}: catalog focus is ${cat.focus?.ledger ? 'the ledger' : 'a transaction'} but the variant resolved ${v.tx ? 'transaction ' + v.tx : 'no transaction'}`);
    if (v.envPtrs.length !== hashes.length) die(`${cat.id}@${v.key}: envelope count ${v.envPtrs.length} != ${hashes.length}`);
    for (const [n, f] of (cat.facts ?? []).entries()) {
      if (f.variants && !f.variants.some((w) => w === v.key || w === v.label)) continue;
      const fact = { says: f.says, evidence: f.evidence ?? ['snapshot'], path: anchor(v, json, f.at) + (f.path ?? '') };
      for (const k of ['equals', 'length', 'some']) if (k in f) fact[k] = resolveValue(f[k], v.manifest);
      const err = check(json, fact); if (err) die(`${cat.id}@${v.key} fact ${n} "${f.says.slice(0, 60)}": ${err}`);
      resolved.push({ n, key: v.key, fact });
    }
  }
  // one fact for all variants when path and value agree, else one per variant
  const facts = [];
  for (const n of [...new Set(resolved.map((r) => r.n))].sort((a, b) => a - b)) {
    const rs = resolved.filter((r) => r.n === n), first = stable({ ...rs[0].fact });
    if (rs.length === variants.length && rs.every((r) => stable(r.fact) === first)) facts.push(rs[0].fact);
    else for (const r of rs) facts.push({ ...r.fact, variants: [r.key] });
  }
  const dir = join(ROOT, 'entries', cat.id); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const entry = { $schema: '../../schema/v1/entry.schema.json', id: cat.id, title: cat.title, pattern: cat.pattern, caps: cat.caps, hazards: cat.hazards, xdr_type: 'LedgerCloseMeta',
    sightings: cat.sightings ?? [], channel: cat.channel ?? 'stable', status: 'active', variants: [], expected: { decoded_as: 'SEP-0051 JSON rendered by stellar-xdr 30.0.0', facts } };
  if (cat.sdk_checks) entry.expected.sdk_checks = cat.sdk_checks;
  for (const v of variants) {
    writeFileSync(join(dir, v.fileName), v.zst ?? v.bytes);
    for (const [f, b] of v.minority) writeFileSync(join(dir, f), b);
    const ve = { key: v.key, protocol: v.protocol, network_passphrase: v.passphrase, file: v.fileName, sha256: sha256(v.bytes), size: v.bytes.length, synthetic: false, source: v.source };
    if (v.change_order && !v.change_order.stable) ve.change_order = v.change_order;
    ve.focus = v.tx ? { tx_hash: v.tx, op_index: v.opIndex } : { ledger: true };
    entry.variants.push(ve);
  }
  writeFileSync(join(dir, 'entry.json'), JSON.stringify(entry, null, 2) + '\n');
  return `${cat.id}: ${variants.length} variant(s), ${facts.length} fact(s)`;
}

const wanted = process.argv.slice(2);
const cats = readdirSync(join(ROOT, 'catalog')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ROOT, 'catalog', f), 'utf8')))
  .filter((c) => !wanted.length || wanted.includes(c.id));
let failed = 0;
for (const c of cats) { try { console.log('  ' + build(c)); } catch (e) { failed++; console.log(`  FAILED ${c.id}: ${e.message}`); } }
console.log(`${cats.length - failed} of ${cats.length} entries built`);
process.exit(failed ? 1 : 0);
