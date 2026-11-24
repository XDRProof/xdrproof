#!/usr/bin/env node
// XDRProof corpus verifier: `make verify`.
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
// Alongside, it runs the mined pubnet ledgers (mined-verify.mjs), the SEP-0023 strkey vectors (strkey.test.mjs)
// and the H-B16 auth signatures (auth-payload-check.mjs), and prints every result as proof cards (tools/ui.mjs):
// cards with a problem first, then the clean ones.
//
// usage: node tools/verify.mjs [--write] [--details]
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { zstdDecompressSync } from 'node:zlib';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { sha256, stable, same, checkFact, normalise, decodeWasm as wasmDecode } from './lib.mjs';
import { makeUI } from './ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write'), DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const read = (p) => readFileSync(join(ROOT, p));
const bytesOf = (file) => (file.endsWith('.zst') ? zstdDecompressSync(readFileSync(file)) : readFileSync(file));
const ui = makeUI(), T0 = Date.now();

if (!existsSync(NATIVE)) {
  console.error('Native reader not built. Run: cargo build --release --manifest-path tools/native/Cargo.toml (or: make native)');
  process.exit(2);
}

// The three smaller checks run as their own processes while the corpus is read, and report one JSON line each.
const sideCheck = (script) => new Promise((res) => execFile(process.execPath, [join(ROOT, 'tools', script), '--json'], { cwd: ROOT, maxBuffer: 1 << 28 }, (err, out) => {
  try { res(JSON.parse(String(out).trim().split('\n').pop())); }
  catch { res({ check: script, problems: [`${script} did not report: ${String(err?.message ?? 'no output').split('\n')[0]}`] }); }
}));
const sideRuns = ['mined-verify.mjs', 'strkey.test.mjs', 'auth-payload-check.mjs'].map(sideCheck), sides = Promise.all(sideRuns);

// Native readers: long-lived processes, requests and responses as line-delimited JSON. Three of them, so the
// ledgers are read in parallel; each request goes to the reader with the fewest waiting.
const readers = Array.from({ length: 3 }, () => {
  const p = spawn(NATIVE, [], { stdio: ['pipe', 'pipe', 'inherit'] }), waiting = new Map();
  createInterface({ input: p.stdout }).on('line', (line) => { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); });
  return { p, waiting };
});
let nextId = 0;
const nativeDecode = (type, bytes) => new Promise((resolve) => {
  const r = readers.reduce((a, b) => (b.waiting.size < a.waiting.size ? b : a)), id = String(nextId++);
  r.waiting.set(id, resolve);
  r.p.stdin.write(JSON.stringify({ id, type, xdr: Buffer.from(bytes).toString('base64') }) + '\n');
});
const mapLimit = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); };

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

// Every failure is filed under the check it belongs to, so each card can say which line failed.
const CHECKS = ['schema', 'files', 'roundtrip', 'focus', 'facts', 'order', 'manifest', 'reader2'];
const failuresBy = Object.fromEntries(CHECKS.map((c) => [c, []]));
const hazardsSeen = new Set();
const ids = readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort();
const work = [];
for (const id of ids) {
  const dir = join(ROOT, 'entries', id), entryPath = join(dir, 'entry.json');
  if (!existsSync(entryPath)) { failuresBy.schema.push(`${id}: missing entry.json`); continue; }
  const entry = JSON.parse(readFileSync(entryPath, 'utf8'));
  if (!validate(entry)) { failuresBy.schema.push(`${id}: schema: ${ajv.errorsText(validate.errors)}`); continue; }
  if (entry.id !== id) failuresBy.schema.push(`${id}: id "${entry.id}" does not match its directory`);
  for (const h of entry.hazards) { if (!registry.has(h.id)) failuresBy.schema.push(`${id}: hazard ${h.id} is not in caps/registry.json`); else hazardsSeen.add(h.id); }
  const keys = new Set();
  for (const v of entry.variants) {
    if (keys.has(v.key)) failuresBy.schema.push(`${id}@${v.key}: duplicate variant key`);
    keys.add(v.key);
    if (!v.file.startsWith(v.key)) failuresBy.schema.push(`${id}@${v.key}: file name must start with the variant key`);
    work.push({ id, dir, entry, v });
  }
}

// Something shows at once: the header as soon as the corpus is counted, then a live block, one row per card,
// while the ledgers are read (erased before the cards print).
ui.header('verify', ui.width < 64 ? '' : `${ui.num(ids.length)} entries · ${ui.num(work.length)} ledger variants`);
const live = { corpus: ui.task('Corpus', { since: T0 }), mined: ui.task('Mined pubnet ledgers', { since: T0 }), keys: ui.task('Keys and signatures', { since: T0 }) };
const settle = (t, results) => (results.some((r) => r.problems?.length) ? t.fail() : t.done());
sideRuns[0].then((r) => settle(live.mined, [r]));
Promise.all(sideRuns.slice(1)).then((rs) => settle(live.keys, rs));

// Each variant's checks; results land in its own slot, so rows and failures keep corpus order.
const slots = new Array(work.length);
let checked = 0;
await mapLimit(work, 12, async (w, k) => { await checkVariant(w, k); live.corpus.count(++checked, work.length); });
async function checkVariant({ id, dir, entry, v }, k) {
  const where = `${id}@${v.key}`, f = [], out = { f };
  slots[k] = out;
  const fail = (check, msg) => f.push([check, `${where}: ${msg}`]);
  const file = join(dir, v.file);
  if (!existsSync(file)) { fail('files', `missing ${v.file}`); return; }
  const bytes = bytesOf(file), digest = sha256(bytes);
  if (bytes.length !== v.size) fail('files', `size ${bytes.length} != ${v.size}`);
  if (digest !== v.sha256) fail('files', `sha256 ${digest} != ${v.sha256}`);
  const r = await nativeDecode(entry.xdr_type, bytes);
  if (r.status !== 'ok') { fail('roundtrip', `native rs-stellar-xdr ${r.stage} failed: ${r.message}`); return; }
  if (!r.identical) fail('roundtrip', 'round trip through rs-stellar-xdr changed the bytes');
  const doc = r.json;
  if (v.focus.tx_hash && !txHashes(doc).has(v.focus.tx_hash)) fail('focus', `focus transaction ${v.focus.tx_hash} is not in this ledger`);
  let facts = 0;
  for (const fact of entry.expected.facts) {
    if (fact.variants && !fact.variants.includes(v.key)) continue;
    const why = checkFact(fact, doc);
    if (why) fail('facts', `fact "${fact.says}": ${why}`); else facts += 1;
  }
  if (v.change_order) {
    const normalized = sha256(stable(normalise(doc)));
    if (normalized !== v.change_order.normalized_sha256) fail('order', `normalised sha256 ${normalized} != ${v.change_order.normalized_sha256}`);
    if (!v.change_order.raw.some((o) => o.sha256 === digest)) fail('order', 'shipped bytes are not among the observed orderings');
    for (const o of v.change_order.raw.filter((x) => x.file)) {
      const ob = bytesOf(join(dir, o.file));
      if (sha256(ob) !== o.sha256) fail('order', `ordering file ${o.file} sha256 mismatch`);
      const od = await nativeDecode(entry.xdr_type, ob);
      if (od.status !== 'ok' || sha256(stable(normalise(od.json))) !== v.change_order.normalized_sha256) fail('order', `ordering file ${o.file} is not the same content`);
    }
  }
  let wasm = 'agrees';
  try { if (!same(JSON.parse(wasmDecode(entry.xdr_type, bytes)), doc)) { wasm = 'DIFFERENT JSON'; fail('reader2', 'WASM and native readers render different JSON'); } }
  catch (e) { wasm = `fails: ${String(e.message ?? e).slice(0, 60)}`; out.refusal = `${where}: ${wasm}`; }
  out.row = {
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
  };
}
for (const r of readers) r.p.stdin.end();
const rows = slots.map((s) => s.row).filter(Boolean);
const refusals = slots.map((s) => s.refusal).filter(Boolean);
for (const s of slots) for (const [check, msg] of s.f) failuresBy[check].push(msg);

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
else if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) failuresBy.manifest.push('manifest.json: out of date; run: node tools/verify.mjs --write');
settle(live.corpus, [{ problems: Object.values(failuresBy).flat() }]);
const [mined, strkey, auth] = await sides;
ui.clear();

// ---- the proof cards -------------------------------------------------------------------------------------------
const WIDTH = ui.width, C = Math.min(WIDTH - 4, 64), INNER = C - 4, narrow = WIDTH < 64;
const num = (n) => Number(n).toLocaleString('en-US');
const BUG67 = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'conformance/bugs.json'), 'utf8')).bugs['stellar/js-stellar-xdr-json#67']; } catch { return null; } })();
const variants = work.length, badVariants = new Set(slots.flatMap((s) => s.f.filter(([c]) => c !== 'reader2').map(([, m]) => m.split(':')[0]))).size;
const depthRefusals = refusals.filter((x) => /depth limit/.test(x)), otherRefusals = refusals.filter((x) => !/depth limit/.test(x));
const changeOrderVariants = work.filter((w) => w.v.change_order).length;
const factsTotal = rows.reduce((n, r) => n + r.facts_checked, 0);
// a line: mark (✓ passed, ! known problem, ✗ failed), text, a count or link at the right
const line = (ok, text, right = '', rightW = right.length, known = false) => ({ mark: ok ? '✓' : known ? '!' : '✗', text, right, rightW });
const cards = [
  { title: 'Corpus', score: [variants - badVariants, variants], lines: [
    line(!failuresBy.schema.length, narrow ? 'entries match the schema' : 'entries match the schema and the hazard list', num(ids.length)),
    line(!failuresBy.files.length, narrow ? 'files match sha256 and size' : 'files match their sha256 and size', num(variants)),
    line(!failuresBy.roundtrip.length, narrow ? 'round-trip byte for byte' : 'ledgers read back byte for byte', num(variants)),
    line(!failuresBy.focus.length, narrow ? 'focus transactions present' : 'every focus transaction is in its ledger', num(variants)),
    line(!failuresBy.facts.length, 'expected values hold', num(factsTotal)),
    line(!failuresBy.order.length, narrow ? 'shuffled orders match' : 'ledgers with shuffled change order match', num(changeOrderVariants)),
    line(!failuresBy.manifest.length, WRITE ? 'manifest.json written' : 'manifest.json is up to date'),
  ] },
  { title: narrow ? 'XDR-JSON 30.0.0' : 'Second reader · stellar-xdr-json', score: [variants - refusals.length - failuresBy.reader2.length, variants], lines: [
    ...(failuresBy.reader2.length ? [line(false, `renders ${failuresBy.reader2.length} ledger${failuresBy.reader2.length === 1 ? '' : 's'} differently`)] : []),
    ...(depthRefusals.length ? [line(false, BUG67?.title ?? 'refuses very deep auth trees', ui.known(ui.link('#67', 'https://github.com/stellar/js-stellar-xdr-json/issues/67')), 3, true)] : []),
    ...(otherRefusals.length ? [line(false, `refuses ${otherRefusals.length} other ledger${otherRefusals.length === 1 ? '' : 's'}`, '', 0, true)] : []),
    ...(!refusals.length && !failuresBy.reader2.length ? [line(true, 'reads every ledger the same way')] : []),
  ] },
  { title: narrow ? 'Pubnet ledgers' : 'Mined pubnet ledgers', score: [(mined.ledgers ?? 0) - (mined.bad_ledgers ?? 0), mined.ledgers ?? 0], lines: [
    line(!mined.problems.length, mined.ledgers ? (narrow ? `${mined.records} records, ${mined.paths} values` : `${mined.records} records and ${mined.paths} values match the ledgers`) : mined.problems[0] ?? 'did not run'),
  ] },
  { title: narrow ? 'Keys, signatures' : 'Keys and signatures', score: [(strkey.valid ?? 0) + (strkey.invalid ?? 0) + (auth.variants ?? 0) - strkey.problems.length - auth.problems.length, (strkey.valid ?? 0) + (strkey.invalid ?? 0) + (auth.variants ?? 0)], lines: [
    line(!strkey.problems.length, strkey.valid !== undefined ? (narrow ? 'strkeys (SEP-0023)' : `strkeys: ${strkey.valid} valid accepted, ${strkey.invalid} invalid refused`) : strkey.problems[0], num((strkey.valid ?? 0) + (strkey.invalid ?? 0))),
    line(!auth.problems.length, auth.variants !== undefined ? (narrow ? 'auth signatures (H-B16)' : 'auth signatures hold (H-B16)') : auth.problems[0], num(auth.variants ?? 0)),
  ] },
];
// cards with a failure first, then cards with a known problem, then the clean ones (each group in its usual order)
const rank = (c) => (c.lines.some((l) => l.mark === '✗') ? 0 : c.lines.some((l) => l.mark === '!') ? 1 : 2);
const ordered = cards.map((c, i) => [c, i]).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j).map(([c]) => c);

const top = (title, score) => {
  const s = `${score[0]}/${score[1]}`, sc = score[0] === score[1] ? s : ui.known(s);
  ui.out(`  ${ui.dim('╭─ ')}${ui.bold(title)}${ui.dim(' ' + '─'.repeat(Math.max(1, C - 7 - title.length - s.length)) + ' ')}${sc}${ui.dim('─╮')}`);
};
const row = (l) => {
  const room = INNER - 2 - (l.rightW ? l.rightW + 1 : 0), text = ui.trunc(l.text, room);
  const mark = l.mark === '✓' ? ui.pass('✓') : l.mark === '!' ? ui.known('!') : ui.bad('✗');
  const right = l.rightW ? ' ' + (l.right.includes('\x1b') ? l.right : ui.dim(l.right)) : '';
  ui.out(`  ${ui.dim('│')} ${mark} ${text}${' '.repeat(Math.max(0, room - text.length))}${right} ${ui.dim('│')}`);
};
const sub = (text) => ui.out(`  ${ui.dim('│')}   ${ui.dim(ui.trunc(text, INNER - 2).padEnd(INNER - 2))} ${ui.dim('│')}`);

for (const c of ordered) {
  top(c.title, c.score);
  for (const l of c.lines) row(l);
  if (DETAILS && c.title.includes('stellar-xdr-json') || DETAILS && c.title === 'XDR-JSON 30.0.0') for (const r of refusals) sub(r.replace(/: fails: .*/, ''));
  ui.out(`  ${ui.dim('╰' + '─'.repeat(C - 2) + '╯')}`);
}
if (DETAILS) {
  ui.out();
  ui.out('  ' + ui.dim(`${hazardsSeen.size} of ${registry.size} hazards targeted`));
  ui.out('  ' + ui.dim(narrow ? 'reader: rs-stellar-xdr 30.0.0' : 'reader: native rs-stellar-xdr 30.0.0, depth limit 1500'));
}

const problems = [...CHECKS.flatMap((c) => failuresBy[c]), ...mined.problems, ...strkey.problems, ...auth.problems];
if (problems.length) {
  const cap = DETAILS ? 40 : 10;
  ui.section('problems');
  for (const p of problems.slice(0, cap)) ui.out('    ' + ui.bad(ui.trunc(p, WIDTH - 6)));
  if (problems.length > cap) ui.out('    ' + ui.dim(`… and ${problems.length - cap} more (make verify DETAILS=1)`));
  ui.verdict('fail', 'FAILED', `${problems.length} problem${problems.length === 1 ? '' : 's'} in the corpus`, Date.now() - T0);
  process.exit(1);
}
ui.verdict('gold', 'PASSED', 'The corpus is intact.', Date.now() - T0);
if (!DETAILS) ui.out(`  ${ui.dim(narrow ? 'more:' : 'every refused ledger and the hazards:')}  make verify DETAILS=1`);
