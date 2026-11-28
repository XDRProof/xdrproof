#!/usr/bin/env node
// XDRProof conformance runner (protocol 1; conformance/README.md). Run through run.sh, which builds the testees.
// usage: node conformance/run.mjs [--details] [--fresh] [--record] [--only name,name] [--entries id,id]
//                                 [--families corpus,strkey,lane-s,depth,sdk-check,sightings] [--format md] [--profile]
//   --details    counts, n/a checks, the known causes in full, the older builds, depths and plain links
//   --entries    only these corpus entries (and, unless --families says otherwise, only the corpus families)
//   --fresh      ignore the result cache (.work/cache) and ask every testee again
//   --record     also write expectations/<testee>.draft.json from this run (for review; never used as is)
//   --format md  print the Markdown matrix (always written to .work/matrix.md) instead of the stamped summary
//   --profile    print where the time went (stderr)
//
// Speed: each testee runs as a small pool of worker processes that take the next ledger as soon as they are free,
// so a slow SDK no longer holds the fast ones back. Answers are cached per testee build, ledger bytes, entry and
// runner code; a rerun with nothing changed reads the cache and starts no testee at all. Verdicts are always judged
// again from the cached checks against the current expectations.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { zstdDecompressSync } from 'node:zlib';
import { stable, same, pointer, checkFact, encode as wasmEncode } from '../tools/lib.mjs';
import { makeUI } from '../tools/ui.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), W = join(HERE, '.work');
const argv = process.argv.slice(2);
const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const RECORD = argv.includes('--record'), FRESH = argv.includes('--fresh'), PROFILE = argv.includes('--profile') || !!process.env.XDRPROOF_PROFILE;
const DETAILS = argv.includes('--details') || argv.includes('-v');
const ONLY = arg('--only')?.split(','), FAMILIES = arg('--families')?.split(','), FORMAT = arg('--format');
// a value that is another flag (or nothing) is no value: --entries with no ids is refused below, never "all" or "none"
const ENTRIES = (() => { const v = arg('--entries'); return v === null ? null : !v || v.startsWith('--') ? [] : v.split(',').filter(Boolean); })();
const ui = makeUI(), T0 = Date.now();
const ALL = ['corpus', 'strkey', 'lane-s', 'depth', 'sdk-check', 'sightings'];
const ALPINE = readFileSync(join(HERE, 'testees/go/runtime-image'), 'utf8').trim();

// ---- digests: what a cached answer depends on ---------------------------------------------------------------
const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest('hex').slice(0, 20); };
const fileSha = (...files) => sha(...files.map((f) => (existsSync(f) ? readFileSync(f) : `missing:${f}`)));
const imageId = (tag) => spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', tag], { encoding: 'utf8' }).stdout?.trim() || `missing:${tag}`;
const T = (p) => join(HERE, 'testees', p);
const GO = (v) => `docker run --rm -i -v ${W}/go:/out:ro ${ALPINE} /out/testee-go-${v}`;
const TESTEES = [
  { name: 'js@17.4.0', cmd: `node ${T('js/testee.cjs')} ${W}/js-17.4.0`, families: ALL, workers: 2, digest: () => sha(process.version, fileSha(T('js/pins/17.4.0/package-lock.json'), T('js/testee.cjs'), `${W}/js-17.4.0/node_modules/.package-lock.json`)) },
  { name: 'xdr-json@30.0.0', cmd: `node ${T('xdr-json/testee.mjs')} ${W}/xdr-json-30.0.0`, families: ['corpus', 'lane-s', 'depth'], workers: 2, digest: () => sha(process.version, fileSha(T('xdr-json/pin/package-lock.json'), T('xdr-json/testee.mjs'), `${W}/xdr-json-30.0.0/node_modules/.package-lock.json`)) },
  { name: 'rust@30.0.0', cmd: `${W}/rust-target/release/xdrproof-testee-rust`, families: ALL, workers: 2, digest: () => fileSha(`${W}/rust-target/release/xdrproof-testee-rust`) },
  { name: 'go@v0.9.0', cmd: GO('v0.9.0'), families: ALL, workers: 2, digest: () => sha(fileSha(`${W}/go/testee-go-v0.9.0`), ALPINE) },
  { name: 'python@17.0.1', cmd: 'docker run --rm -i xdrproof-testee-python:17.0.1', families: ALL, workers: 4, digest: () => imageId('xdrproof-testee-python:17.0.1') },
  { name: 'python-xdr@0.2.1', cmd: 'docker run --rm -i xdrproof-testee-python-xdr:0.2.1', families: ['corpus', 'strkey', 'lane-s', 'depth'], workers: 3, digest: () => imageId('xdrproof-testee-python-xdr:0.2.1') },
  ...['17.2.0', '17.2.1', '17.3.0'].map((v) => ({ name: `js@${v}`, cmd: `node ${T('js/testee.cjs')} ${W}/js-${v}`, families: ['sightings'], workers: 1, digest: () => sha(process.version, fileSha(T(`js/pins/${v}/package-lock.json`), T('js/testee.cjs'), `${W}/js-${v}/node_modules/.package-lock.json`)) })),
  ...['v0.7.1', 'v0.7.2'].map((v) => ({ name: `go@${v}`, cmd: GO(v), families: ['sightings'], workers: 1, digest: () => sha(fileSha(`${W}/go/testee-go-${v}`), ALPINE) })),
];
const unknownOnly = (ONLY ?? []).filter((n) => !TESTEES.some((t) => t.name === n));
if (unknownOnly.length) { console.error(`unknown build(s) in --only: ${unknownOnly.join(', ')}\nbuilds: ${TESTEES.map((t) => t.name).join(', ')}`); process.exit(2); }
const SELECTED = TESTEES.filter((t) => !ONLY || ONLY.includes(t.name));
const families = (FAMILIES ?? (ENTRIES !== null ? ['corpus', 'sdk-check'] : ALL)).filter((f) => ALL.includes(f));
// --entries: the corpus entries to run (all when absent); a check of another entry is not expected to run
const ENTRY_IDS = readdirSync(join(ROOT, 'entries')).filter((d) => existsSync(join(ROOT, 'entries', d, 'entry.json'))).sort();
const unknownEntries = (ENTRIES ?? []).filter((e) => !ENTRY_IDS.includes(e));
if (argv.includes('--entries') && !ENTRIES?.length) { console.error('conformance: --entries needs at least one corpus entry id, e.g. --entries auth.tree-depth-246-trapped'); process.exit(2); }
if (unknownEntries.length) { console.error(`conformance: no such corpus entr${unknownEntries.length === 1 ? 'y' : 'ies'}: ${unknownEntries.join(', ')}`); process.exit(2); }
if (ENTRIES !== null && RECORD) { console.error('conformance: --record needs the whole corpus; drop --entries'); process.exit(2); }
const pickedEntry = (id) => ENTRIES === null || ENTRIES.includes(id);
const checkRan = (k) => { const [fam, rest = ''] = k.split('/'); return !(fam === 'corpus' || fam === 'sdk-check') || pickedEntry(rest.split('@')[0]); };
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
// Everything outside the testee that shapes a verdict: this runner, the shared checks, the reference reader.
// (this file only up to its summary section: how results are shown does not change them)
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf8'), JUDGING = SELF.slice(0, SELF.indexOf('\n// ---- the summary'));
const RUNNER = sha(process.version, JUDGING, fileSha( join(ROOT, 'tools/lib.mjs'), join(ROOT, 'tools/strkey.mjs'), join(ROOT, 'tools/coverage/defs/sep0051-enum-names.json'), join(ROOT, 'tools/package-lock.json'), NATIVE));

// ---- worker pools: line-delimited JSON processes, one request in flight per process -------------------------
let workerSeq = 0;
const live = new Set();
class Worker {
  constructor(cmd) { this.cmd = cmd; this.seq = 0; this.child = null; this.used = false; }
  start() {
    // Containers get a name, so a timed-out or interrupted run stops the container, not only the docker client.
    this.container = /^docker run /.test(this.cmd) ? `xdrproof-conf-${process.pid}-${++workerSeq}` : null;
    const cmd = this.container ? this.cmd.replace(/^docker run /, `docker run --name ${this.container} `) : this.cmd;
    const me = spawn('sh', ['-c', `exec ${cmd}`], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = me; this.pending = null; this.used = true;
    createInterface({ input: me.stdout, crlfDelay: Infinity }).on('line', (l) => { let m; try { m = JSON.parse(l); } catch { return; } if (this.child === me && this.pending?.id === m.id) this.pending.done(m); });
    me.on('exit', () => { live.delete(me); if (this.child !== me) return; this.child = null; this.pending?.done({ status: 'crash' }); });
    me.container = this.container;
    me.stdin.on('error', () => {});
    live.add(me);
  }
  send(payload, ms) {
    if (!this.child) this.start();
    const id = String(this.seq++);
    return new Promise((res) => {
      const timer = setTimeout(() => { this.pending = null; this.kill(); res({ status: 'timeout' }); }, ms);
      this.pending = { id, done: (m) => { clearTimeout(timer); this.pending = null; res(m); } };
      this.child.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
    });
  }
  kill() { const c = this.child; this.child = null; if (c) killProc(c); else if (this.container) spawn('docker', ['rm', '-f', this.container], { stdio: 'ignore' }).on('error', () => {}); }
  stop() { if (this.child) this.child.stdin.end(); }
}
class Pool {
  constructor(cmd, n) { this.workers = Array.from({ length: n }, () => new Worker(cmd)); this.idle = [...this.workers]; this.queue = []; this.busyMs = 0; this.calls = 0; }
  // The timeout starts when a worker takes the request, not while it waits in the queue.
  request(payload, ms = 30000) { return new Promise((res) => { this.queue.push({ payload, ms, res }); this.pump(); }); }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop(), job = this.queue.shift(), t0 = performance.now();
      w.send(job.payload, job.ms).then((m) => { this.busyMs += performance.now() - t0; this.calls++; this.idle.push(w); job.res(m); this.pump(); });
    }
  }
  started() { return this.workers.filter((w) => w.used).length; }
  stop() { for (const w of this.workers) w.stop(); }
}
// Every process stays in `live` until it has exited; a container is stopped with docker kill, not only its client.
// docker rm -f, not docker kill: it also removes a container Docker created but never started (seen under heavy load)
function killProc(c) { c.kill('SIGKILL'); if (c.container) spawnSync('docker', ['rm', '-f', c.container], { stdio: 'ignore' }); }
const killAll = () => { for (const c of [...live]) killProc(c); };
// After a normal run: close every stdin, give the processes a moment to exit, then kill what is left.
async function shutdown(pools) {
  for (const p of pools) p.stop();
  const t0 = Date.now(); while (live.size && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 25));
  killAll();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { ui.clear(); killAll(); process.exit(sig === 'SIGINT' ? 130 : 143); });
process.on('uncaughtException', (e) => { ui.clear(); killAll(); console.error(e); process.exit(2); });
process.on('unhandledRejection', (e) => { ui.clear(); killAll(); console.error(e); process.exit(2); });

// ---- the result cache ------------------------------------------------------------------------------------------
// One file per testee: the checks each unit (a corpus variant, a vector) produced. Valid only while the testee
// build, the runner and the testee's expectations file (its known-difference rules) are unchanged.
const CACHE_DIR = join(W, 'cache');
const slug = (s) => s.replace(/[^\w.-]+/g, '_');
const flaky = (list) => list.some(([, v, d]) => v === 'fail' && /^(crash|timeout)$/.test(d));
const testees = SELECTED.map((t) => {
  const expPath = join(HERE, 'expectations', `${t.name}.json`);
  const key = sha(t.digest(), RUNNER, existsSync(expPath) ? readFileSync(expPath) : '');
  let cache = { key, hello: null, units: {} };
  const file = join(CACHE_DIR, `${slug(t.name)}.json`);
  if (!FRESH && existsSync(file)) { try { const c = JSON.parse(readFileSync(file, 'utf8')); if (c.key === key) cache = c; else if (PROFILE) process.stderr.write(`cache stale for ${t.name}: built with ${c.key}, now ${key}\n`); } catch {} }
  return { ...t, pool: new Pool(t.cmd, t.workers), cache, file, used: {}, hits: 0, misses: 0 };
});
const ask = (t, op, input, ms) => t.pool.request({ op, input }, ms);

// ---- results ----------------------------------------------------------------------------------------------
const results = new Map(); // testee -> Map(check id -> {verdict: pass|fail|na, detail})
const put = (t, check, verdict, detail = '') => { if (!results.has(t.name)) results.set(t.name, new Map()); results.get(t.name).set(check, { verdict, detail: String(detail).slice(0, 240) }); };
// One unit of work for a testee, from the cache or live; fn(put) records the unit's checks.
async function unit(t, key, fn) {
  const hit = t.cache.units[key];
  if (hit) { t.hits++; t.used[key] = hit; for (const [c, v, d] of hit) put(t, c, v, d); return; }
  t.misses++;
  const list = [];
  await fn((c, v, d = '') => { put(t, c, v, d); list.push([c, v, String(d).slice(0, 240)]); });
  if (!flaky(list)) t.used[key] = list;
}
const failed = (r) => (r.status === 'crash' || r.status === 'timeout' ? r.status : r.status === 'error' ? `${r.error?.stage} error: ${r.error?.message}` : null);
// first JSON pointer where two documents differ, for a readable detail
const firstDiff = (a, b, p = '') => {
  if (same(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${p}/${k}`); if (d) return d; }
  }
  return `${p || '/'}: ${stable(a)?.slice(0, 70)} instead of ${stable(b)?.slice(0, 70)}`;
};
// fn over items, at most n in flight
const mapLimit = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); };

// ---- the reference reader: native rs-stellar-xdr (tools/native), started only when a testee needs a live answer --
const ref = new Pool(NATIVE, 2);
const refDecode = (type, b64) => ref.request({ type, xdr: b64 }, 120000);

const EXP = Object.fromEntries(testees.map((t) => { const p = join(HERE, 'expectations', `${t.name}.json`); return [t.name, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { fail: {}, depth_max: null }]; }));
// Known, upstream-reported SEP-0051 differences of a testee, as rules applied to its JSON before the comparison. Each
// rule acts only where its upstream report says the difference is, so any other difference still fails:
//   { rule: 'enum_prefix_underscore', enums: ['TransactionResultCode', 'OperationResultCode'] }: a result-code name
//     written without the underscore after tx/op, only as the arm of a transaction result (the object or string at a
//     "result" key) and of each operation result (the elements of tx_success / tx_failed);
//   { rule: 'rename_key', from, to, in }: a key renamed, only inside the object held under key `in`;
//   { rule: 'unwrap_asset_code' }: {"credit_alphanum4": "ABC"} for "ABC", only as allow_trust.asset;
//   { rule: 'hex_contract_id' }: a 64-hex contract_id for its C strkey, only in a ContractEvent (has type and body)
//     or a ConfigUpgradeSetKey (has content_hash).
const SEP51_ENUMS = JSON.parse(readFileSync(join(ROOT, 'tools/coverage/defs/sep0051-enum-names.json'), 'utf8')).enums;
const { contract: cStrkey } = await import('../tools/strkey.mjs');
function knownJson(rules = []) {
  if (!rules.length) return null;
  const tx = new Map(), op = new Map(), keyRules = []; let unwrap = false, hexC = false;
  for (const r of rules) {
    if (r.rule === 'enum_prefix_underscore') for (const e of r.enums) for (const v of Object.values(SEP51_ENUMS[e] ?? {})) (e === 'OperationResultCode' ? op : tx).set(v.replace(/^(tx|op)_/, '$1'), v);
    else if (r.rule === 'rename_key') keyRules.push(r);
    else if (r.rule === 'unwrap_asset_code') unwrap = true;
    else if (r.rule === 'hex_contract_id') hexC = true;
    else throw new Error('unknown json_known rule ' + r.rule);
  }
  const opResult = (x) => {
    if (typeof x === 'string') return op.get(x) ?? x;
    if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 1) { const [k] = Object.keys(x); const nk = op.get(k) ?? k; return { [nk]: walk(x[k], nk, x, null) }; }
    return walk(x, null, null, null);
  };
  // v sits under `key` in object `holder`, which itself sits under `holderKey`
  const walk = (v, key, holder, holderKey) => {
    if (Array.isArray(v)) return key === 'tx_success' || key === 'tx_failed' ? v.map(opResult) : v.map((x) => walk(x, key, holder, holderKey));
    if (typeof v === 'string') {
      if (key === 'result' && tx.has(v)) return tx.get(v);
      if (hexC && key === 'contract_id' && /^[0-9a-f]{64}$/.test(v) && holder && (('type' in holder && 'body' in holder) || 'content_hash' in holder)) return cStrkey(Buffer.from(v, 'hex'));
      return v;
    }
    if (v && typeof v === 'object') {
      const ks = Object.keys(v);
      if (unwrap && key === 'asset' && holderKey === 'allow_trust' && ks.length === 1 && /^credit_alphanum(4|12)$/.test(ks[0]) && typeof v[ks[0]] === 'string') return v[ks[0]];
      return Object.fromEntries(ks.map((k) => {
        const nk = (key === 'result' && ks.length === 1 && tx.get(k)) || keyRules.find((r) => r.from === k && r.in === key)?.to || k;
        return [nk, walk(v[k], nk, v, key)];
      }));
    }
    return v;
  };
  return (doc) => walk(doc, null, null, null);
}
const KNOWN = Object.fromEntries(testees.map((t) => [t.name, knownJson(EXP[t.name].json_known)]));
const inFamily = (f) => testees.filter((t) => t.families.includes(f));
const PHASE = {}; let PT = performance.now(); const phase = (k) => { const n = performance.now(); PHASE[k] = Math.round(n - PT); PT = n; };

// --profile: a heartbeat every 5 s, so a slow or stuck run shows where it is
let corpusDone = 0;
const beat = PROFILE ? setInterval(() => ui.err(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ledgers ${corpusDone} · ${[...testees, { name: 'reference', pool: ref }].map((t) => `${t.name.split('@')[0]} q${t.pool.queue.length}/idle${t.pool.idle.length}`).join(' ')}`), 5000) : null;
beat?.unref();
// ---- what this run checks, said at once: the header, then a live block (one row per kind of work) ------------
const corpusCount = families.includes('corpus') || families.includes('sdk-check')
  ? ENTRY_IDS.filter(pickedEntry).reduce((n, d) => n + JSON.parse(readFileSync(join(ROOT, 'entries', d, 'entry.json'), 'utf8')).variants.length, 0) : 0;
const builds0 = testees.filter((t) => !(t.families.length === 1 && t.families[0] === 'sightings')).length || testees.length; // as isOlder, below
// (--format md prints only the matrix, as before: no header, no live rows)
if (FORMAT !== 'md') ui.header('conformance', ui.width >= 64 ? `${builds0} SDK build${builds0 === 1 ? '' : 's'}${families.includes('corpus') && corpusCount ? ` · ${ui.num(corpusCount)} real ledger${corpusCount === 1 ? '' : 's'}` : ''}${FAMILIES ? ` · ${families.join(', ')} only` : ''}` : '');
const VECTOR_FILES = { strkey: 'strkey.json', 'lane-s': 'lane-s.json', depth: 'depth.json', sightings: 'sightings.json' };
const vectorCount = Object.entries(VECTOR_FILES).filter(([f]) => families.includes(f)).reduce((n, [, file]) => n + JSON.parse(readFileSync(join(HERE, 'vectors', file), 'utf8')).length, 0);
const quiet = FORMAT === 'md', none = { count() {}, done() {} };
const rowsLive = {
  builds: quiet ? none : ui.task('Starting the SDK builds', { since: T0 }),
  ledgers: corpusCount && !quiet ? ui.task('Real ledgers', { waiting: true }) : null,
  vectors: vectorCount && !quiet ? ui.task('Test vectors', { waiting: true }) : null,
};
let vectorsDone = 0;

// ---- hello: every testee names its implementation (cached with its answers) --------------------------------
const hello = {};
let helloDone = 0;
await Promise.all(testees.map(async (t) => { hello[t.name] = t.cache.hello ?? (await ask(t, 'hello', {})).implementation ?? null; rowsLive.builds.count(++helloDone, testees.length); }));
rowsLive.builds.done();
phase('hello');

// ---- family: corpus (and sdk-check, which reads the same ledgers) --------------------------------------------
let corpusVariants = 0;
if (families.includes('corpus') || families.includes('sdk-check')) {
  const ids = readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory() && pickedEntry(d)).sort();
  const work = [];
  for (const id of ids) {
    const text = readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'), entry = JSON.parse(text), esha = sha(text);
    // keyed on the bytes on disk, not only the hash entry.json records for them
    for (const v of entry.variants) work.push({ id, entry, v, key: `${id}@${v.key}:${fileSha(join(ROOT, 'entries', id, v.file))}:${esha}` });
  }
  const total = work.length;
  await mapLimit(work, 32, async ({ id, entry, v, key }) => {
    const corpusT = families.includes('corpus') ? inFamily('corpus') : [], sdkT = families.includes('sdk-check') ? inFamily('sdk-check') : [];
    const checks = (entry.expected.sdk_checks ?? []).map((s, k) => [s, k]).filter(([s]) => s.helper === 'native-projection');
    const needLive = corpusT.some((t) => !t.cache.units['corpus:' + key]) || (checks.length && sdkT.some((t) => !t.cache.units['sdk:' + key]));
    let b64, reference, size = v.size ?? 0;
    if (needLive) {
      const f = join(ROOT, 'entries', id, v.file);
      const bytes = f.endsWith('.zst') ? zstdDecompressSync(readFileSync(f)) : readFileSync(f);
      b64 = bytes.toString('base64'); size = bytes.length;
      reference = (await refDecode(entry.xdr_type, b64)).json;
    }
    const ms = 30000 + Math.ceil(size / 1e6) * 20000;
    const facts = entry.expected.facts.filter((x) => !x.variants || x.variants.includes(v.key));
    await Promise.all(corpusT.map((t) => unit(t, 'corpus:' + key, async (put) => {
      const c = `corpus/${id}@${v.key}`;
      const r = await ask(t, 'decode', { type: entry.xdr_type, xdr: b64 }, ms);
      if (r.status === 'unsupported') return put(`${c}/decode`, 'na', r.reason);
      const why = failed(r);
      put(`${c}/decode`, why ? 'fail' : 'pass', why ?? '');
      if (why) return;
      put(`${c}/roundtrip`, r.xdr === b64 ? 'pass' : 'fail', r.xdr === b64 ? '' : 're-encoded bytes differ');
      if (r.json_error) { put(`${c}/json`, 'fail', `SEP-0051 rendering raised: ${r.json_error}`); return put(`${c}/facts`, 'fail', 'no JSON to check the facts on'); }
      if (r.json === undefined) { put(`${c}/json`, 'na', 'no SEP-0051 JSON'); return put(`${c}/facts`, 'na', 'no SEP-0051 JSON'); }
      const json = KNOWN[t.name] ? KNOWN[t.name](r.json) : r.json;
      const d = firstDiff(json, reference);
      put(`${c}/json`, d ? 'fail' : 'pass', d ?? (KNOWN[t.name] && !same(json, r.json) ? 'equal after the known differences' : ''));
      const bad = facts.map((x) => [x, checkFact(x, json)]).filter(([, w]) => w); // every fact, on the testee's own JSON
      put(`${c}/facts`, bad.length ? 'fail' : 'pass', bad.map(([x, w]) => `"${x.says.slice(0, 50)}": ${w}`).join('; '));
    })));
    // sdk-check: each entry's expected.sdk_checks, on the value the path points at (reference JSON -> XDR)
    if (checks.length) await Promise.all(sdkT.map((t) => unit(t, 'sdk:' + key, async (put) => {
      for (const [s, k] of checks) {
        const val = pointer(reference, s.path), n = val?.map?.length;
        const scval = wasmEncode('ScVal', JSON.stringify(val)).toString('base64');
        const r = await ask(t, 'native', { type: 'ScVal', xdr: scval });
        const c = `sdk-check/${id}@${v.key}/${k}`;
        if (r.status === 'unsupported') { put(c, 'na', r.reason); continue; }
        if (r.status === 'error' && r.error?.stage === 'native') { put(c, 'pass', 'rejected'); continue; }
        const why = failed(r); if (why) { put(c, 'fail', why); continue; }
        const got = r.value?.$object?.length;
        put(c, got === n ? 'pass' : 'fail', got === n ? 'lossless' : `kept ${got} of ${n} entries`);
      }
    })));
    corpusVariants++; corpusDone = corpusVariants; rowsLive.ledgers?.count(corpusVariants, total);
  });
}
rowsLive.ledgers?.done();
phase('corpus');

// ---- families: strkey, lane-s, depth, sightings ----------------------------------------------------------------
const load = (n) => JSON.parse(readFileSync(join(HERE, 'vectors', n), 'utf8'));
const vkey = (fam, vec) => `${fam}:${vec.id}:${sha(JSON.stringify(vec))}`;
const vectors = async (fam, file, fn) => {
  if (!families.includes(fam)) return;
  const list = load(file);
  // an empty vector file would pass every build without testing anything
  if (!list.length) { console.error(`conformance: ${file} has no vectors, so the ${fam} family would test nothing`); process.exit(1); }
  await mapLimit(list, 16, async (vec) => { await Promise.all(inFamily(fam).map((t) => unit(t, vkey(fam, vec), (put) => fn(t, vec, put)))); rowsLive.vectors?.count(++vectorsDone, vectorCount); });
};
await vectors('strkey', 'strkey.json', async (t, vec, put) => {
  const r = await ask(t, 'strkey_decode', { strkey: vec.strkey }), c = `strkey/${vec.id}`;
  if (r.status === 'unsupported') return put(c, 'na', r.reason);
  if (vec.expect === 'reject') return put(c, r.status === 'error' ? 'pass' : 'fail', r.status === 'error' ? 'rejected' : (failed(r) ?? `accepted as ${r.kind}`));
  const why = failed(r); if (why) return put(c, 'fail', why);
  const ok = r.kind === vec.expect.kind && r.payload === vec.expect.payload;
  put(c, ok ? 'pass' : 'fail', ok ? '' : `got ${r.kind} ${String(r.payload).slice(0, 24)}…`);
});
await vectors('lane-s', 'lane-s.json', async (t, vec, put) => {
  const r = await ask(t, vec.op, vec.op === 'decode' ? { type: vec.type, xdr: vec.xdr } : { type: vec.type, json: vec.json }, 20000), c = `lane-s/${vec.id}`;
  if (r.status === 'unsupported') return put(c, 'na', r.reason);
  if (r.status === 'crash' || r.status === 'timeout') return put(c, 'fail', r.status);
  if (vec.expect === 'reject') return put(c, r.status === 'error' ? 'pass' : 'fail', r.status === 'error' ? 'rejected' : 'accepted');
  const ok = r.status === 'ok' && r.xdr === (vec.op === 'encode_json' ? vec.expect_xdr : vec.xdr);
  put(c, ok ? 'pass' : 'fail', ok ? '' : failed(r) ?? 're-encoding differs');
});
const DEPTH = families.includes('depth') ? load('depth.json') : [];
await vectors('depth', 'depth.json', async (t, vec, put) => {
  const r = await ask(t, 'decode', { type: 'ScVal', xdr: vec.xdr }, 20000);
  if (r.status === 'unsupported') return put(`depth/${vec.id}`, 'na', r.reason);
  const ok = r.status === 'ok' && r.xdr === vec.xdr;
  // a refusal is an acceptable answer to depth; a crash or a timeout is not
  const bad = r.status === 'crash' || r.status === 'timeout' || (r.status === 'ok' && !ok);
  put(`depth/${vec.id}`, bad ? 'fail' : 'pass', ok ? 'decoded' : failed(r) ?? 're-encoding differs');
});
// the deepest vector each testee decoded and re-encoded exactly
const depthMax = {};
if (DEPTH.length) for (const t of inFamily('depth')) depthMax[t.name] = Math.max(0, ...DEPTH.filter((v) => results.get(t.name)?.get(`depth/${v.id}`)?.detail === 'decoded').map((v) => v.depth));
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
await vectors('sightings', 'sightings.json', async (t, v, put) => { const [verdict, detail] = judge(v, await ask(t, v.op, v.input)); put(`sightings/${v.id}`, verdict, detail); });
rowsLive.vectors?.done();
phase('vectors');
await shutdown([...testees.map((t) => t.pool), ref]);
ui.clear();

// ---- the cache, written back: this run's checks for every unit it judged ------------------------------------
mkdirSync(CACHE_DIR, { recursive: true });
for (const t of testees) {
  if (!t.misses && t.cache.hello) continue;
  writeFileSync(t.file, JSON.stringify({ key: t.cache.key, hello: hello[t.name], units: { ...t.cache.units, ...t.used } }));
}

// Checks in a fixed order (family, then id), whatever order the pools finished them in.
const FAM = Object.fromEntries(ALL.map((f, i) => [f, i]));
const sorted = new Map();
for (const t of testees) if (results.has(t.name)) sorted.set(t.name, new Map([...results.get(t.name)].sort(([a], [b]) => FAM[a.split('/')[0]] - FAM[b.split('/')[0]] || (a < b ? -1 : a > b ? 1 : 0))));
results.clear(); for (const [k, m] of sorted) results.set(k, m);

// ---- expectations: an unexpected failure and an unexpected pass both fail the run ----------------------------
const unexpected = [], summary = [], knownReasons = {}, badBy = {};
for (const t of testees) {
  const exp = EXP[t.name];
  const mine = results.get(t.name) ?? new Map();
  const counts = {};
  const miss = (line) => { unexpected.push(line); badBy[t.name] = (badBy[t.name] ?? 0) + 1; };
  // expected failures name their cause: { reason, detail } where detail is a regular expression the result must match;
  // checks a testee cannot do are registered as unsupported: { "<glob>": reason }
  const glob = (g) => new RegExp('^' + g.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  const unsupported = Object.keys(exp.unsupported ?? {}).map(glob);
  for (const [check, r] of mine) {
    const fam = check.split('/')[0], known = exp.fail?.[check];
    counts[fam] ??= { pass: 0, expected: 0, unexpected: 0, na: 0 };
    const bad = (why) => { counts[fam].unexpected++; miss(`${t.name} ${check}: ${why}`); };
    if (r.verdict === 'na') { if (unsupported.some((re) => re.test(check))) counts[fam].na++; else bad(`not supported (${r.detail}), and not registered as unsupported`); }
    else if (r.verdict === 'pass' && !known) counts[fam].pass++;
    else if (r.verdict === 'pass') bad(`PASSES but is expected to fail (${known.reason})`);
    else if (!known) bad(`FAILS: ${r.detail}`);
    else if (!new RegExp(known.detail).test(r.detail)) bad(`fails for another reason: ${r.detail} (expected /${known.detail}/)`);
    else { counts[fam].expected++; (knownReasons[t.name] ??= []).push({ reason: known.reason ?? '', bug: known.bug ?? null, check }); }
  }
  const want = t.name.slice(t.name.indexOf('@') + 1).replace(/^v/, ''), got = String(hello[t.name]?.version ?? '').replace(/^v/, '');
  if (!got.startsWith(want)) miss(`${t.name}: the testee reports version ${got || 'none'}, not ${want}`);
  // --only picks builds, not checks: a selected build still runs every check of its families
  for (const k of Object.keys(exp.fail ?? {})) if (!mine.has(k) && families.includes(k.split('/')[0]) && t.families.includes(k.split('/')[0]) && checkRan(k)) miss(`${t.name} ${k}: expected to fail, but the check did not run`);
  if (families.includes('depth') && t.families.includes('depth') && exp.depth_max != null && !(t.name in depthMax)) miss(`${t.name} depth: no depth result, expected ${exp.depth_max} levels`);
  if (t.name in depthMax && exp.depth_max !== undefined && exp.depth_max !== null && depthMax[t.name] !== exp.depth_max) miss(`${t.name} depth: decodes to ${depthMax[t.name]} levels, expected ${exp.depth_max}`);
  summary.push({ name: t.name, implementation: hello[t.name], counts, depth_max: depthMax[t.name] ?? null });
  if (RECORD) {
    const draft = { testee: t.name, implementation: hello[t.name], depth_max: depthMax[t.name] ?? null, ...(exp.json_known ? { json_known: exp.json_known } : {}),
      unsupported: exp.unsupported ?? Object.fromEntries([...mine].filter(([, r]) => r.verdict === 'na').map(([k, r]) => [k, r.detail])),
      fail: Object.fromEntries([...mine].filter(([, r]) => r.verdict === 'fail').map(([k, r]) => [k, exp.fail?.[k] ?? { reason: 'TODO', detail: '^' + r.detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' }])) };
    mkdirSync(join(HERE, 'expectations'), { recursive: true });
    writeFileSync(join(HERE, 'expectations', `${t.name}.draft.json`), JSON.stringify(draft, null, 1) + '\n');
  }
}
phase('judge');
if (PROFILE) {
  const cpu = process.cpuUsage();
  process.stderr.write(`phases ms ${JSON.stringify(PHASE)}  runner cpu ${Math.round((cpu.user + cpu.system) / 1000)} ms\n`);
  for (const t of [...testees, { name: 'reference', pool: ref, hits: 0, misses: 0 }]) process.stderr.write(`  ${t.name.padEnd(18)} workers ${t.pool.started()}/${t.pool.workers.length}  busy ${Math.round(t.pool.busyMs)} ms  calls ${t.pool.calls}  cached ${t.hits}  live ${t.misses}\n`);
}

// ---- matrix -------------------------------------------------------------------------------------------------
mkdirSync(W, { recursive: true });
writeFileSync(join(W, 'matrix.json'), JSON.stringify({ schema: 'xdrproof.matrix/v1', testees: summary, results: Object.fromEntries([...results].map(([k, m]) => [k, Object.fromEntries(m)])) }, null, 1));
const cell = (c) => (!c ? 'not run' : [c.pass && `${c.pass} pass`, c.expected && `${c.expected} known`, c.unexpected && `**${c.unexpected} unexpected**`, c.na && `${c.na} n/a`].filter(Boolean).join(', ') || 'none');
let md = `| Family | ${summary.map((s) => `\`${s.name}\``).join(' | ')} |\n|---|${summary.map(() => '---').join('|')}|\n`;
for (const f of families) md += `| ${f} | ${summary.map((s) => cell(s.counts[f])).join(' | ')} |\n`;
md += `| deepest ScVal decoded | ${summary.map((s) => (s.depth_max === null ? 'not run' : `${s.depth_max} levels`)).join(' | ')} |\n`;
writeFileSync(join(W, 'matrix.md'), md);
if (FORMAT === 'md') {
  process.stdout.write('\n' + md);
  if (unexpected.length) { console.log(`\n${unexpected.length} unexpected result(s):\n  ` + unexpected.slice(0, 80).join('\n  ') + (unexpected.length > 80 ? `\n  … and ${unexpected.length - 80} more (${W}/matrix.json)` : '')); process.exit(1); }
  console.log('\nOK: every result matches the pre-registered expectations (conformance/expectations/).');
  process.exit(0);
}

// ---- the summary (tools/ui.mjs) ---------------------------------------------------------------------------------
// One row per SDK build: how many corpus ledgers it read exactly as stellar-core wrote them, and the known bugs behind
// any it did not, each as a short title (conformance/bugs.json) with a link to where it was reported.
const BUGS = JSON.parse(readFileSync(join(HERE, 'bugs.json'), 'utf8')).bugs;
const issueOf = (id) => id.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
const bugUrl = (id) => BUGS[id]?.url ?? (issueOf(id) ? `https://github.com/${issueOf(id)[1]}/${issueOf(id)[2]}/issues/${issueOf(id)[3]}` : null);
const bugLabel = (id) => BUGS[id]?.label ?? (issueOf(id) ? `#${issueOf(id)[3]}` : id);
const NAMES = { js: 'JavaScript SDK', 'xdr-json': 'JS XDR-JSON', rust: 'Rust XDR', go: 'Go SDK', python: 'Python SDK', 'python-xdr': 'Python XDR' };
const RELEASE = {
  js: (v) => `https://www.npmjs.com/package/@stellar/stellar-sdk/v/${v}`,
  'xdr-json': (v) => `https://www.npmjs.com/package/@stellar/stellar-xdr-json/v/${v}`,
  rust: (v) => `https://crates.io/crates/stellar-xdr/${v}`,
  go: (v) => `https://pkg.go.dev/github.com/stellar/go-stellar-sdk@${v}`,
  python: (v) => `https://pypi.org/project/stellar-sdk/${v}/`,
  'python-xdr': (v) => `https://pypi.org/project/stellar-xdr/${v}/`,
};
const isOlder = (t) => t.families.length === 1 && t.families[0] === 'sightings';
const rows = testees.map((t) => {
  const [lang, ver] = t.name.split('@');
  // a corpus ledger is read right when none of its checks failed (checks a build cannot do don't count against it)
  const byVariant = new Map();
  for (const [c, r] of results.get(t.name) ?? []) if (c.startsWith('corpus/')) { const v = c.split('/')[1]; byVariant.set(v, (byVariant.get(v) ?? true) && r.verdict !== 'fail'); }
  const bugs = new Map();
  for (const k of knownReasons[t.name] ?? []) { const id = k.bug ?? 'unlabelled'; const b = bugs.get(id) ?? { id, checks: 0 }; b.checks++; bugs.set(id, b); }
  return { t, lang, ver, older: isOlder(t), ledgers: byVariant.size, right: [...byVariant.values()].filter(Boolean).length, bugs: [...bugs.values()].sort((a, b) => b.checks - a.checks), bad: badBy[t.name] ?? 0, ran: (results.get(t.name)?.size ?? 0) > 0 };
}).filter((r) => r.ran || r.bad);
const current = rows.filter((r) => !r.older), older = rows.filter((r) => r.older);
const linkList = new Map();
// Proof cards: a framed card per SDK with bugs, its name and version on the top edge and
// its ledger score at the right; one line per bug with its link; the clean SDKs share one card. Cards are as wide as
// the terminal allows (up to 64 columns) and every line fits, down to 40 columns.
const WIDTH = ui.width, C = Math.min(WIDTH - 4, 64), INNER = C - 4;
const total = current.find((r) => r.ledgers)?.ledgers ?? 0;
const nameOf = (r) => { const n = `${WIDTH < 64 ? SHORT[r.lang] ?? r.lang : NAMES[r.lang] ?? r.lang} `; return { text: ui.bold(n) + ui.bold(ui.link(r.ver, RELEASE[r.lang]?.(r.ver))), width: n.length + r.ver.length }; };
const cardTop = (left, leftW, right, rightW) => ui.out(rightW
  ? `  ${ui.dim('╭─ ')}${left}${ui.dim(' ' + '─'.repeat(Math.max(1, C - 7 - leftW - rightW)) + ' ')}${right}${ui.dim('─╮')}`
  : `  ${ui.dim('╭─ ')}${left}${ui.dim(' ' + '─'.repeat(Math.max(1, C - 6 - leftW)) + '─╮')}`);
const cardRow = (text, width) => ui.out(`  ${ui.dim('│')} ${text}${' '.repeat(Math.max(0, INNER - width))} ${ui.dim('│')}`);
const cardEnd = () => ui.out(`  ${ui.dim('╰' + '─'.repeat(C - 2) + '╯')}`);
const scoreOf = (r) => { if (!r.ledgers) return ['', 0]; const t = `${r.right}/${r.ledgers}`; return [r.right === r.ledgers ? t : r.bad ? ui.bad(t) : ui.known(t), t.length]; };
const card = (r, detailed) => {
  const n = nameOf(r), [score, sw] = scoreOf(r);
  cardTop(n.text, n.width, score, sw);
  if (r.bad) { const t = `${r.bad} new problem${r.bad === 1 ? '' : 's'}, listed below`; cardRow(`${ui.bad('✗')} ${ui.bad(ui.trunc(t, INNER - 2))}`, 2 + Math.min(t.length, INNER - 2)); }
  for (const b of r.bugs) {
    const meta = BUGS[b.id] ?? { title: 'see conformance/expectations' }, url = bugUrl(b.id), label = bugLabel(b.id);
    if (url && !ui.links) linkList.set(label, url);
    const room = INNER - 2 - label.length - 1, title = ui.trunc(meta.title, room);
    cardRow(`${ui.known('!')} ${title}${' '.repeat(room - title.length + 1)}${ui.known(ui.link(label, url))}`, INNER);
    if (detailed) { const st = ui.trunc(`${meta.state ?? ''}${meta.state ? ' · ' : ''}${b.checks} check${b.checks === 1 ? '' : 's'}`, INNER - 2); cardRow(`  ${ui.dim(st)}`, 2 + st.length); }
  }
  cardEnd();
};
const SHORT = { js: 'JS', 'xdr-json': 'XDR-JSON', rust: 'Rust', go: 'Go', python: 'Python', 'python-xdr': 'Py-XDR' };

for (const r of current.filter((x) => x.bugs.length || x.bad)) card(r, DETAILS);
// the builds with no bugs share one card, as many per line as fit
const cleanCard = (list, right) => {
  if (!list.length) return;
  cardTop(ui.bold('No bugs'), 7, right, right.length);
  let line = [], w = 0;
  const flush = () => { if (line.length) cardRow(`${ui.pass('✓')} ${line.join(ui.dim(' · '))}`, 2 + w); line = []; w = 0; };
  for (const r of list) { const n = nameOf(r); if (w && 2 + w + 3 + n.width > INNER) flush(); w += (w ? 3 : 0) + n.width; line.push(n.text); }
  flush(); cardEnd();
};
cleanCard(current.filter((x) => !x.bugs.length && !x.bad), total ? `${total}/${total}` : '');
// Older releases run only the regression tests (bugs fixed later): with DETAILS=1, or when one of them went wrong.
if (older.length && (DETAILS || older.some((r) => r.bad) || !current.length)) {
  if (current.length) ui.section(WIDTH >= 50 ? 'older releases · their bugs were fixed later' : 'older releases, fixed later');
  for (const r of older.filter((x) => x.bugs.length || x.bad)) card(r, DETAILS);
  cleanCard(older.filter((x) => !x.bugs.length && !x.bad), '');
}
if (DETAILS) {
  const depths = summary.filter((x) => x.depth_max !== null), cachedN = testees.filter((t) => !t.misses).length;
  ui.out();
  if (depths.length) {
    // wrapped to the terminal: "deepest value read  JS 256 · XDR-JSON 64 · …"
    const items = depths.map((x) => `${SHORT[x.name.split('@')[0]] ?? x.name} ${x.depth_max}`), head = 'deepest value read  ';
    let line = '', out = [];
    for (const it of items) { if (line && 2 + head.length + line.length + 3 + it.length > WIDTH - 2) { out.push(line); line = ''; } line += (line ? ' · ' : '') + it; }
    out.push(line);
    out.forEach((l, i) => ui.out('  ' + ui.dim(i ? ' '.repeat(head.length) : head) + l.split(' · ').join(ui.dim(' · '))));
  }
  ui.out('  ' + ui.dim(cachedN === testees.length ? (WIDTH >= 80 ? 'results reused from the last run · ARGS="--fresh" runs everything again' : (WIDTH >= 50 ? 'reused from the last run (--fresh reruns)' : 'reused (--fresh reruns)')) : cachedN ? `${testees.length - cachedN} builds rerun, ${cachedN} reused` : 'every build run fresh'));
}
// Where the terminal cannot open hidden links, every bug named above gets its full URL, which it can open.
if (!ui.links && linkList.size) {
  const w = Math.max(...[...linkList.keys()].map((k) => k.length));
  ui.out();
  for (const [lbl, url] of linkList) ui.out(`  ${ui.known(lbl.padEnd(w))}  ${ui.dim(url)}`);
}
if (unexpected.length) {
  const cap = DETAILS ? 40 : 10;
  ui.section('new problems');
  for (const u of unexpected.slice(0, cap)) ui.out('    ' + ui.bad(ui.trunc(u, WIDTH - 6)));
  if (unexpected.length > cap) ui.out('    ' + ui.dim(`… and ${unexpected.length - cap} more in conformance/.work/matrix.json`));
  ui.verdict('fail', 'FAILED', `${unexpected.length} new problem${unexpected.length === 1 ? '' : 's'}`, Date.now() - T0);
  ui.out(`  ${ui.dim('rerun one build')}  make conformance ARGS="--only <build>"`);
  process.exit(1);
}
ui.verdict('gold', 'PASSED', 'No new bugs.', Date.now() - T0);
// the one hint: what the detailed view adds, in plain words, and the command for it
if (!DETAILS) ui.out(`  ${ui.dim(WIDTH >= 64 ? 'bug status and older releases:' : 'more:')}  make conformance DETAILS=1`);
// (end of the summary)
