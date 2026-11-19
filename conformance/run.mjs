#!/usr/bin/env node
// XDRProof conformance runner (protocol 1; conformance/README.md). Run through run.sh, which builds the testees.
// usage: node conformance/run.mjs [--record] [--only name,name] [--families corpus,strkey,lane-s,depth,sdk-check,sightings]
//   --record   also write expectations/<testee>.draft.json from this run (for review; never used as is)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { zstdDecompressSync } from 'node:zlib';
import { stable, pointer, checkFact, encode as wasmEncode } from '../tools/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), W = join(HERE, '.work');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const RECORD = process.argv.includes('--record');
const ONLY = arg('--only')?.split(','), FAMILIES = arg('--families')?.split(',');
const ALL = ['corpus', 'strkey', 'lane-s', 'depth', 'sdk-check', 'sightings'];
const GO = (v) => `docker run --rm -i -e SDK_VERSION=${v} -v ${W}/go:/out:ro alpine:3.22 /out/testee-go-${v}`;
const TESTEES = [
  { name: 'js@17.4.0', cmd: `node ${HERE}/testees/js/testee.cjs ${W}/js-17.4.0`, families: ALL },
  { name: 'xdr-json@30.0.0', cmd: `node ${HERE}/testees/xdr-json/testee.mjs ${W}/xdr-json-30.0.0`, families: ['corpus', 'lane-s', 'depth'] },
  { name: 'rust@30.0.0', cmd: `${W}/rust-target/release/xdrproof-testee-rust`, families: ALL },
  { name: 'go@v0.9.0', cmd: GO('v0.9.0'), families: ALL },
  { name: 'python@17.0.1', cmd: 'docker run --rm -i xdrproof-testee-python:17.0.1', families: ALL },
  { name: 'python-xdr@0.2.1', cmd: 'docker run --rm -i xdrproof-testee-python-xdr:0.2.1', families: ['corpus', 'strkey', 'lane-s', 'depth'] },
  ...['17.2.0', '17.2.1', '17.3.0'].map((v) => ({ name: `js@${v}`, cmd: `node ${HERE}/testees/js/testee.cjs ${W}/js-${v}`, families: ['sightings'] })),
  ...['v0.7.1', 'v0.7.2'].map((v) => ({ name: `go@${v}`, cmd: GO(v), families: ['sightings'] })),
].filter((t) => !ONLY || ONLY.includes(t.name));
const families = (FAMILIES ?? ALL).filter((f) => ALL.includes(f));

// ---- testee processes: line-delimited JSON, restarted after a crash ---------------------------------------
class Testee {
  constructor(t) { Object.assign(this, t); this.seq = 0; this.start(); }
  start() {
    this.child = spawn('sh', ['-c', this.cmd], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.waiting = new Map(); const waiting = this.waiting;
    createInterface({ input: this.child.stdout, crlfDelay: Infinity }).on('line', (l) => { let m; try { m = JSON.parse(l); } catch { return; } waiting.get(m.id)?.(m); });
    this.child.on('exit', () => { this.dead = true; for (const f of waiting.values()) f({ status: 'crash' }); waiting.clear(); });
    this.child.stdin.on('error', () => {}); this.dead = false;
  }
  ask(op, input, ms = 30000) {
    if (this.dead) this.start();
    const id = String(this.seq++);
    return new Promise((res) => {
      const t = setTimeout(() => { this.waiting.delete(id); this.child.kill('SIGKILL'); res({ status: 'timeout' }); }, ms);
      this.waiting.set(id, (m) => { clearTimeout(t); this.waiting.delete(id); res(m); });
      this.child.stdin.write(JSON.stringify({ id, op, input }) + '\n');
    });
  }
  stop() { this.child.stdin.end(); }
}

// ---- results ----------------------------------------------------------------------------------------------
const results = new Map(); // testee -> Map(check id -> {verdict: pass|fail|na, detail})
const put = (t, check, verdict, detail = '') => { if (!results.has(t.name)) results.set(t.name, new Map()); results.get(t.name).set(check, { verdict, detail: String(detail).slice(0, 240) }); };
const failed = (r) => (r.status === 'crash' || r.status === 'timeout' ? r.status : r.status === 'error' ? `${r.error?.stage} error: ${r.error?.message}` : null);
// first JSON pointer where two documents differ, for a readable detail
const firstDiff = (a, b, p = '') => {
  if (stable(a) === stable(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${p}/${k}`); if (d) return d; }
  }
  return `${p || '/'}: ${stable(a)?.slice(0, 70)} instead of ${stable(b)?.slice(0, 70)}`;
};

// ---- the reference reader: native rs-stellar-xdr (tools/native), one long-lived process ---------------------
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const ref = new Testee({ name: 'reference', cmd: NATIVE });
const refDecode = async (type, b64) => { const r = await new Promise((res) => { const id = String(ref.seq++); ref.waiting.set(id, (m) => { ref.waiting.delete(id); res(m); }); ref.child.stdin.write(JSON.stringify({ id, type, xdr: b64 }) + '\n'); }); return r; };

const testees = TESTEES.map((t) => new Testee(t));
const EXP = Object.fromEntries(testees.map((t) => { const p = join(HERE, 'expectations', `${t.name}.json`); return [t.name, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { fail: {}, depth_max: null }]; }));
// Known, upstream-reported SEP-0051 differences of a testee, as rules applied to its JSON before the comparison, so any
// other difference still fails: { rule: 'enum_prefix_underscore', enums: [...] } (a result-code name written without the
// underscore after its tx/op prefix, as a key or a value), { rule: 'rename_key', from, to }, { rule: 'unwrap_asset_code' }
// ({"credit_alphanum4": "ABC"} for "ABC"), { rule: 'hex_contract_id' } (64-hex contract_id for its C strkey).
const SEP51_ENUMS = JSON.parse(readFileSync(join(ROOT, 'tools/coverage/defs/sep0051-enum-names.json'), 'utf8')).enums;
const { contract: cStrkey } = await import('../tools/strkey.mjs');
function knownJson(rules = []) {
  if (!rules.length) return null;
  const rename = new Map(), keyRename = new Map(); let unwrap = false, hexC = false;
  for (const r of rules) {
    if (r.rule === 'enum_prefix_underscore') for (const e of r.enums) for (const v of Object.values(SEP51_ENUMS[e] ?? {})) rename.set(v.replace(/^(tx|op)_/, '$1'), v);
    else if (r.rule === 'rename_key') keyRename.set(r.from, r.to);
    else if (r.rule === 'unwrap_asset_code') unwrap = true;
    else if (r.rule === 'hex_contract_id') hexC = true;
    else throw new Error('unknown json_known rule ' + r.rule);
  }
  const fix = (v, key) => {
    if (typeof v === 'string') return hexC && key === 'contract_id' && /^[0-9a-f]{64}$/.test(v) ? cStrkey(Buffer.from(v, 'hex')) : rename.get(v) ?? v;
    if (Array.isArray(v)) return v.map((x) => fix(x, key));
    if (v && typeof v === 'object') {
      const ks = Object.keys(v);
      if (unwrap && key === 'asset' && ks.length === 1 && /^credit_alphanum(4|12)$/.test(ks[0]) && typeof v[ks[0]] === 'string') return v[ks[0]];
      return Object.fromEntries(ks.map((k) => { const nk = keyRename.get(k) ?? rename.get(k) ?? k; return [nk, fix(v[k], nk)]; }));
    }
    return v;
  };
  return (doc) => fix(doc, '');
}
const KNOWN = Object.fromEntries(testees.map((t) => [t.name, knownJson(EXP[t.name].json_known)]));
const inFamily = (f) => testees.filter((t) => t.families.includes(f));
const hello = {}; for (const t of testees) hello[t.name] = (await t.ask('hello', {})).implementation ?? null;

// ---- family: corpus -----------------------------------------------------------------------------------------
if (families.includes('corpus') || families.includes('sdk-check')) {
  const ids = readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort();
  let done = 0;
  for (const id of ids) {
    const entry = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
    for (const v of entry.variants) {
      const f = join(ROOT, 'entries', id, v.file);
      const bytes = f.endsWith('.zst') ? zstdDecompressSync(readFileSync(f)) : readFileSync(f), b64 = bytes.toString('base64');
      const reference = (await refDecode(entry.xdr_type, b64)).json;
      const ms = 30000 + Math.ceil(bytes.length / 1e6) * 20000;
      const facts = entry.expected.facts.filter((x) => !x.variants || x.variants.includes(v.key));
      if (families.includes('corpus')) await Promise.all(inFamily('corpus').map(async (t) => {
        const c = `corpus/${id}@${v.key}`;
        const r = await t.ask('decode', { type: entry.xdr_type, xdr: b64 }, ms);
        if (r.status === 'unsupported') return put(t, `${c}/decode`, 'na', r.reason);
        const why = failed(r);
        put(t, `${c}/decode`, why ? 'fail' : 'pass', why ?? '');
        if (why) return;
        put(t, `${c}/roundtrip`, r.xdr === b64 ? 'pass' : 'fail', r.xdr === b64 ? '' : 're-encoded bytes differ');
        if (r.json_error) return put(t, `${c}/json`, 'fail', `SEP-0051 rendering raised: ${r.json_error}`);
        if (r.json === undefined) return put(t, `${c}/json`, 'na', 'no SEP-0051 JSON');
        const json = KNOWN[t.name] ? KNOWN[t.name](r.json) : r.json;
        const d = firstDiff(json, reference);
        put(t, `${c}/json`, d ? 'fail' : 'pass', d ?? (KNOWN[t.name] && stable(json) !== stable(r.json) ? 'equal after the known differences' : ''));
        const bad = d ? facts.map((x) => [x, checkFact(x, json)]).filter(([, w]) => w) : [];
        put(t, `${c}/facts`, bad.length ? 'fail' : 'pass', bad.map(([x, w]) => `"${x.says.slice(0, 50)}": ${w}`).join('; '));
      }));
      // sdk-check: each entry's expected.sdk_checks, on the value the path points at (reference JSON -> XDR)
      if (families.includes('sdk-check')) for (const [k, s] of (entry.expected.sdk_checks ?? []).entries()) {
        if (s.helper !== 'native-projection') continue;
        const val = pointer(reference, s.path), n = val?.map?.length;
        const scval = wasmEncode('ScVal', JSON.stringify(val)).toString('base64');
        await Promise.all(inFamily('sdk-check').map(async (t) => {
          const r = await t.ask('native', { type: 'ScVal', xdr: scval });
          const c = `sdk-check/${id}@${v.key}/${k}`;
          if (r.status === 'unsupported') return put(t, c, 'na', r.reason);
          if (r.status === 'error') return put(t, c, 'pass', 'rejected');
          const why = failed(r); if (why) return put(t, c, 'fail', why);
          const got = r.value?.$object?.length;
          put(t, c, got === n ? 'pass' : 'fail', got === n ? 'lossless' : `kept ${got} of ${n} entries`);
        }));
      }
      if (++done % 50 === 0) process.stderr.write(`  corpus: ${done} variants\n`);
    }
  }
}

// ---- families: strkey, lane-s, depth ------------------------------------------------------------------------
const load = (n) => JSON.parse(readFileSync(join(HERE, 'vectors', n), 'utf8'));
if (families.includes('strkey')) for (const vec of load('strkey.json')) await Promise.all(inFamily('strkey').map(async (t) => {
  const r = await t.ask('strkey_decode', { strkey: vec.strkey }), c = `strkey/${vec.id}`;
  if (r.status === 'unsupported') return put(t, c, 'na', r.reason);
  if (vec.expect === 'reject') return put(t, c, r.status === 'error' ? 'pass' : 'fail', r.status === 'error' ? 'rejected' : (failed(r) ?? `accepted as ${r.kind}`));
  const why = failed(r); if (why) return put(t, c, 'fail', why);
  const ok = r.kind === vec.expect.kind && r.payload === vec.expect.payload;
  put(t, c, ok ? 'pass' : 'fail', ok ? '' : `got ${r.kind} ${String(r.payload).slice(0, 24)}…`);
}));
if (families.includes('lane-s')) for (const vec of load('lane-s.json')) await Promise.all(inFamily('lane-s').map(async (t) => {
  const r = await t.ask(vec.op, vec.op === 'decode' ? { type: vec.type, xdr: vec.xdr } : { type: vec.type, json: vec.json }, 20000), c = `lane-s/${vec.id}`;
  if (r.status === 'unsupported') return put(t, c, 'na', r.reason);
  if (r.status === 'crash' || r.status === 'timeout') return put(t, c, 'fail', r.status);
  if (vec.expect === 'reject') return put(t, c, r.status === 'error' ? 'pass' : 'fail', r.status === 'error' ? 'rejected' : 'accepted');
  const ok = r.status === 'ok' && (vec.op === 'encode_json' || r.xdr === vec.xdr);
  put(t, c, ok ? 'pass' : 'fail', ok ? '' : failed(r) ?? 're-encoding differs');
}));
const depthMax = {};
if (families.includes('depth')) for (const t of inFamily('depth')) {
  let max = 0;
  for (const vec of load('depth.json')) {
    const r = await t.ask('decode', { type: 'ScVal', xdr: vec.xdr }, 20000);
    if (r.status === 'unsupported') { put(t, `depth/${vec.id}`, 'na', r.reason); continue; }
    const ok = r.status === 'ok' && r.xdr === vec.xdr;
    if (ok) max = Math.max(max, vec.depth);
    // a refusal is an acceptable answer to depth; a crash or a timeout is not
    put(t, `depth/${vec.id}`, r.status === 'crash' || r.status === 'timeout' ? 'fail' : 'pass', ok ? 'decoded' : failed(r) ?? 're-encoding differs');
  }
  depthMax[t.name] = max;
}

// ---- family: sightings (the prototype's vectors) ------------------------------------------------------------
if (families.includes('sightings')) {
  const judge = (v, r) => {
    if (r.status === 'unsupported') return ['na', 'unsupported'];
    if (r.status === 'timeout' || r.status === 'crash') return ['fail', r.status];
    const e = v.expect, err = r.status === 'error';
    if (e.error) return err ? ['pass', 'rejected'] : ['fail', 'accepted: ' + stable(r.value)];
    if (e.error_or_equals) return err ? ['pass', 'rejected'] : stable(r.value) === stable(e.error_or_equals.value) ? ['pass', 'exact'] : ['fail', 'wrong value: ' + stable(r.value)];
    if (e.error_or_count) { if (err) return ['pass', 'rejected']; const n = pointer(r, '/' + e.error_or_count.path.replace(/\./g, '/'))?.length; return n === e.error_or_count.count ? ['pass', 'lossless'] : ['fail', `lossy: ${n} of ${e.error_or_count.count}`]; }
    if (err) return ['fail', `${r.error.stage} error: ${r.error.message}`];
    if (e.equals) return stable(r.value) === stable(e.equals.value) ? ['pass', ''] : ['fail', 'wrong value: ' + stable(r.value)];
    if (e.roundtrip) { if (r.xdr !== v.input.xdr) return ['fail', 're-encode differs']; if (r.json === undefined || e.json === undefined) return ['pass', 'bytes only']; return stable(r.json) === stable(e.json) ? ['pass', 'bytes + json'] : ['fail', 'json differs']; }
    return ['fail', 'no check'];
  };
  for (const v of load('sightings.json')) await Promise.all(inFamily('sightings').map(async (t) => { const [verdict, detail] = judge(v, await t.ask(v.op, v.input)); put(t, `sightings/${v.id}`, verdict, detail); }));
}
for (const t of testees) t.stop(); ref.stop();

// ---- expectations: an unexpected failure and an unexpected pass both fail the run ----------------------------
const unexpected = [], summary = [];
for (const t of testees) {
  const exp = EXP[t.name];
  const mine = results.get(t.name) ?? new Map();
  const counts = {};
  for (const [check, r] of mine) {
    const fam = check.split('/')[0], known = check in (exp.fail ?? {});
    counts[fam] ??= { pass: 0, expected: 0, unexpected: 0, na: 0 };
    if (r.verdict === 'na') counts[fam].na++;
    else if (r.verdict === 'pass' && !known) counts[fam].pass++;
    else if (r.verdict === 'fail' && known) counts[fam].expected++;
    else { counts[fam].unexpected++; unexpected.push(`${t.name} ${check}: ${r.verdict === 'pass' ? 'PASSES but is expected to fail (' + exp.fail[check] + ')' : 'FAILS: ' + r.detail}`); }
  }
  for (const k of Object.keys(exp.fail ?? {})) if (!mine.has(k) && (FAMILIES ?? ALL).includes(k.split('/')[0]) && !ONLY?.length) unexpected.push(`${t.name} ${k}: expected to fail, but the check did not run`);
  if (t.name in depthMax && exp.depth_max !== undefined && exp.depth_max !== null && depthMax[t.name] !== exp.depth_max) unexpected.push(`${t.name} depth: decodes to ${depthMax[t.name]} levels, expected ${exp.depth_max}`);
  summary.push({ name: t.name, implementation: hello[t.name], counts, depth_max: depthMax[t.name] ?? null });
  if (RECORD) {
    const draft = { testee: t.name, implementation: hello[t.name], depth_max: depthMax[t.name] ?? null, ...(exp.json_known ? { json_known: exp.json_known } : {}),
      fail: Object.fromEntries([...mine].filter(([, r]) => r.verdict === 'fail').map(([k, r]) => [k, exp.fail?.[k] ?? `TODO: ${r.detail}`])) };
    mkdirSync(join(HERE, 'expectations'), { recursive: true });
    writeFileSync(join(HERE, 'expectations', `${t.name}.draft.json`), JSON.stringify(draft, null, 1) + '\n');
  }
}

// ---- matrix -------------------------------------------------------------------------------------------------
mkdirSync(W, { recursive: true });
writeFileSync(join(W, 'matrix.json'), JSON.stringify({ schema: 'xdrproof.matrix/v1', testees: summary, results: Object.fromEntries([...results].map(([k, m]) => [k, Object.fromEntries(m)])) }, null, 1));
const cell = (c) => (!c ? 'not run' : [c.pass && `${c.pass} pass`, c.expected && `${c.expected} known`, c.unexpected && `**${c.unexpected} unexpected**`, c.na && `${c.na} n/a`].filter(Boolean).join(', ') || 'none');
let md = `| Family | ${summary.map((s) => `\`${s.name}\``).join(' | ')} |\n|---|${summary.map(() => '---').join('|')}|\n`;
for (const f of families) md += `| ${f} | ${summary.map((s) => cell(s.counts[f])).join(' | ')} |\n`;
md += `| deepest ScVal decoded | ${summary.map((s) => (s.depth_max === null ? 'not run' : `${s.depth_max} levels`)).join(' | ')} |\n`;
writeFileSync(join(W, 'matrix.md'), md);
process.stdout.write('\n' + md);
if (unexpected.length) { console.log(`\n${unexpected.length} unexpected result(s):\n  ` + unexpected.slice(0, 80).join('\n  ') + (unexpected.length > 80 ? `\n  … and ${unexpected.length - 80} more (${W}/matrix.json)` : '')); process.exit(1); }
console.log('\nOK: every result matches the pre-registered expectations (conformance/expectations/).');
