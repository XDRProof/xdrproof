#!/usr/bin/env node
// harness.mjs: replays corpus ledgers into a real indexer, one isolated session per ledger, and gives every
// corpus variant a verdict read from the indexer's own state: its process, its cursor, and what it stored
// (replay/README.md). The indexer is reached only through its adapter (adapters/<name>/adapter.toml).
//
//   node replay/harness.mjs --adapter wallet-backend --target main [--entries a,b] [--variants id@key,...]
//                           [--sightings] [--jobs 4] [--record] [--keep]
//   --sightings  replay only the variants replay/sightings.json lists for this target
//
// Exit: 0 when every verdict matches replay/expectations/<adapter>@<target>.json, 1 on any difference,
// 2 on a harness, adapter or control failure (an `error` verdict is never a finding).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parse as parseToml } from '../tools/node_modules/smol-toml/dist/index.js';
import { variantBytes, decodeXdr } from './lib/derive.mjs';
import { startMockRpc } from './lib/mock-rpc.mjs';
import { decode as strkeyDecode } from '../tools/strkey.mjs';
const strkeyPayload = (s) => strkeyDecode(s).payload;

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const NETWORK = { 'Public Global Stellar Network ; September 2015': 'pubnet', 'Test SDF Network ; September 2015': 'testnet' };
const SEVERITY = ['handled', 'dropped', 'mishandled', 'stalled', 'crashed', 'halted', 'error'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha256').update(b).digest('hex');

const { values: opt } = parseArgs({ options: {
  adapter: { type: 'string' }, target: { type: 'string', default: 'main' },
  entries: { type: 'string' }, variants: { type: 'string' }, jobs: { type: 'string', default: '4' },
  record: { type: 'boolean', default: false }, keep: { type: 'boolean', default: false },
  sightings: { type: 'boolean', default: false },
} });
const die = (m, code = 2) => { console.error(`replay: ${m}`); process.exit(code); };
if (!opt.adapter) die('--adapter is required');

// ---- adapter and target ---------------------------------------------------------------------------------
const ADIR = join(HERE, 'adapters', opt.adapter);
const A = parseToml(readFileSync(join(ADIR, 'adapter.toml'), 'utf8'));
const T = A.targets?.[opt.target] ?? die(`adapter ${A.name} has no target ${opt.target}`);
const WORK = join(HERE, '.work', A.name), OUT = join(HERE, 'runs', `${A.name}@${opt.target}`);
mkdirSync(join(WORK, 'derive'), { recursive: true }); mkdirSync(join(OUT, 'sessions'), { recursive: true });
const supported = new Set(A.supports.probes);
const baseEnv = { ...process.env, XDRPROOF_ADAPTER_WORK: WORK, XDRPROOF_TARGET: opt.target, XDRPROOF_TARGET_REF: T.ref, XDRPROOF_MEMORY_MB: String(A.limits?.memory_mb ?? 1024) };

// Run one adapter command to completion; resolves { code, stdout, stderr }.
function run(name, env = {}, { input, timeoutS = 120 } = {}) {
  const cmd = A.commands[name];
  if (!cmd) return Promise.resolve({ code: 0, stdout: '', stderr: '', missing: true });
  return new Promise((resolve) => {
    const p = spawn('sh', ['-c', cmd], { cwd: ADIR, env: { ...baseEnv, ...env } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (c) => (stdout += c)); p.stderr.on('data', (c) => (stderr += c));
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutS * 1000);
    p.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
    if (input !== undefined) p.stdin.end(input); else p.stdin.end();
  });
}
const must = async (name, env, o) => {
  const r = await run(name, env, o);
  if (r.code !== 0) throw Object.assign(new Error(`adapter ${name} exited ${r.code}: ${(r.stderr || r.stdout).trim().split('\n').slice(-5).join(' | ')}`), { adapterError: true });
  return r;
};

// ---- the plan: one session per distinct ledger (bytes + network) ------------------------------------------
const entries = readdirSync(join(ROOT, 'entries')).filter((d) => existsSync(join(ROOT, 'entries', d, 'entry.json')))
  .map((d) => JSON.parse(readFileSync(join(ROOT, 'entries', d, 'entry.json'), 'utf8')));
const wantEntries = opt.entries && new Set(opt.entries.split(','));
// --sightings: the variants of every sighting (replay/sightings.json) that names this target
const wantVariants = opt.sightings
  ? new Set(JSON.parse(readFileSync(join(HERE, 'sightings.json'), 'utf8')).sightings.filter((x) => opt.target in x.verdicts).flatMap((x) => x.variants))
  : opt.variants && new Set(opt.variants.split(','));
if (wantVariants && wantVariants.size === 0) die(`no sighting names target ${opt.target}`);
const known = new Set(entries.flatMap((e) => e.variants.map((v) => `${e.id}@${v.key}`)));
for (const id of wantEntries ?? []) if (!entries.some((e) => e.id === id)) die(`no corpus entry ${id}`);
for (const vid of wantVariants ?? []) if (!known.has(vid)) die(`no corpus variant ${vid}`);
const partial = Boolean(wantEntries || (wantVariants && !opt.sightings)); // a subset: the judged-set check is skipped
const controls = JSON.parse(readFileSync(join(HERE, 'controls.json'), 'utf8')).controls;
const variants = [];
for (const e of entries) for (const v of e.variants) {
  const vid = `${e.id}@${v.key}`;
  if (wantEntries && !wantEntries.has(e.id)) continue;
  if (wantVariants && !wantVariants.has(vid)) continue;
  variants.push({ vid, entry: e, v, path: join(ROOT, 'entries', e.id, v.file) });
}
const verdicts = new Map(); // vid -> record
const sessions = new Map();
const sessionOf = (x) => {
  const key = `${x.v.sha256}|${x.v.network_passphrase}`;
  if (!sessions.has(key)) sessions.set(key, { key, sha256: x.v.sha256, path: x.path, passphrase: x.v.network_passphrase, protocol: x.v.protocol, vids: [] });
  return sessions.get(key);
};
for (const x of variants) {
  const net = NETWORK[x.v.network_passphrase];
  if (x.v.protocol > T.protocol_max) verdicts.set(x.vid, { verdict: 'unsupported', why: `protocol ${x.v.protocol} > ${A.name}@${opt.target} protocol_max ${T.protocol_max}` });
  else if (!A.supports.networks.includes(net)) verdicts.set(x.vid, { verdict: 'unsupported', why: `network ${net}` });
  else sessionOf(x).vids.push(x.vid);
}
const controlSessions = controls.filter((c) => c.protocol <= T.protocol_max).map((c) => {
  const [id, key] = c.variant.split('@');
  const e = entries.find((x) => x.id === id) ?? die(`control ${c.variant} not in the corpus`);
  const v = e.variants.find((x) => x.key === key) ?? die(`control ${c.variant} not in the corpus`);
  return { key: `control|${c.variant}`, control: c.variant, sha256: v.sha256, path: join(ROOT, 'entries', id, v.file), passphrase: v.network_passphrase, protocol: v.protocol, vids: [] };
});

// ---- one session ------------------------------------------------------------------------------------------
// Everything read from the ledger with the native reader (probes, header, end state), computed before any
// session starts in a child process per ledger (lib/derive-cli.mjs), and cached on disk. The harness itself
// never holds a ledger's JSON, so its memory does not depend on ledger size or corpus size.
// The cache key is the ledger's bytes (checked against the manifest's sha256), the network, and a
// fingerprint of the code that derives (derive.mjs, derive-cli.mjs, strkey.mjs and the native reader), so a
// changed probe rule or reader is never judged with facts derived by the old one.
const FINGERPRINT = sha(Buffer.concat(['replay/lib/derive.mjs', 'replay/lib/derive-cli.mjs', 'tools/strkey.mjs', 'tools/native/target/release/xdrproof-native']
  .map((f) => readFileSync(join(ROOT, f))))).slice(0, 16);
const deriveFile = (s) => join(WORK, 'derive', `${s.sha256}-${sha(s.passphrase).slice(0, 8)}-${FINGERPRINT}.json`);
let deriveChildPeak = 0;
function prepareDerived(s) {
  if (!s.bytesChecked) {
    const got = sha(variantBytes(s.path));
    if (got !== s.sha256) throw new Error(`${s.path} has sha256 ${got}, the manifest says ${s.sha256}`);
    s.bytesChecked = true;
  }
  const f = deriveFile(s);
  if (existsSync(f)) return;
  const peak = Number(execFileSync(process.execPath, [join(HERE, 'lib', 'derive-cli.mjs'), s.path, s.passphrase, f], { maxBuffer: 2 ** 20 }).toString());
  deriveChildPeak = Math.max(deriveChildPeak, peak);
}
function derived(s) {
  prepareDerived(s);
  return JSON.parse(readFileSync(deriveFile(s), 'utf8'));
}

async function supervise(env, mock, last, logFile) {
  const log = createWriteStream(logFile, { flags: 'a' });
  const p = spawn('sh', ['-c', A.commands.start], { cwd: ADIR, env: { ...baseEnv, ...env }, detached: true });
  p.stdout.pipe(log); p.stderr.pipe(log);
  let exited = null;
  p.on('close', (code, signal) => { exited = { code, signal }; });
  const t0 = Date.now(), ledgerMs = (A.timeouts?.ledger_s ?? 30) * 1000, capMs = (A.timeouts?.session_s ?? 120) * 1000;
  let cursor = null, lastMove = Date.now(), failingSince = null, outcome;
  for (;;) {
    const r = await run('cursor', env, { timeoutS: 20 });
    const ok = r.code === 0 && /^\d+$/.test(r.stdout.trim());
    // a cursor the adapter cannot read is the adapter's failure, never a stall
    if (!ok) { failingSince ??= Date.now(); if (Date.now() - failingSince > CURSOR_FAIL_MS) { outcome = { passed: false, reason: 'adapter', error: `cursor: ${(r.stderr || r.stdout).trim().slice(-300)}` }; break; } }
    else failingSince = null;
    const c = ok ? Number(r.stdout.trim()) : cursor;
    if (c !== cursor) { cursor = c; lastMove = Date.now(); }
    if (c !== null && c >= last) {
      // in follow mode the indexer must keep running after the ledger: an exit now is a crash on it
      for (let i = 0; i < 4 && !exited; i++) await sleep(250);
      outcome = { passed: true, ...(exited && (exited.code !== 0 || exited.signal) ? { exited_after_commit: exited } : {}) };
      break;
    }
    if (exited) { outcome = { passed: false, reason: 'exited', ...exited }; break; }
    if (Date.now() - lastMove > ledgerMs) { outcome = { passed: false, reason: 'stalled' }; break; }
    if (Date.now() - t0 > capMs) { outcome = { passed: false, reason: 'timeout' }; break; }
    await sleep(250);
  }
  const stop = await run('stop', env, { timeoutS: 30 });
  if (!exited) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } }
  for (let i = 0; i < 40 && !exited; i++) await sleep(250);
  if (!exited) { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* gone */ } }
  let mem = null;
  try { mem = JSON.parse(stop.stdout.trim() || '{}').memory_peak_bytes ?? null; } catch { /* no report */ }
  log.end();
  return { ...outcome, cursor, ms: Date.now() - t0, memory_peak_bytes: mem, requests: mock.log.length };
}

const CURSOR_FAIL_MS = 10000;

// Invariants: answered over everything the indexer stored for the session, not per fact.
//   addresses.valid  every stored address decodes and is one the ledger names
//   facts.extra      every stored creation, merge and trustline change is one the ledger states
const INVARIANTS = [{ id: 'addresses.valid', kind: 'addresses.valid' }, { id: 'facts.extra', kind: 'facts.extra' }];
const EXTRA_KINDS = ['account.created', 'contract.created', 'account.removed', 'trustline.added', 'trustline.removed'];
const poolKey = (v) => (/^L[A-Z2-7]{55}$/.test(v) ? Buffer.from(strkeyPayload(v)).toString('hex') : String(v).toLowerCase());
const factKey = (f) => [f.kind, f.tx_hash, f.account ?? f.contract,
  f.asset ? (f.asset.startsWith('pool:') ? poolKey(f.asset.slice(5)) : f.asset_contract) : f.pool ? poolKey(f.pool) : f.asset_contract ?? ''].join(' ');

// Compare the adapter's answers with what the ledger states.
function judge(d, answers) {
  const byId = new Map(answers.map((a) => [a.id, a]));
  const out = { pass: 0, na: 0, failures: [] };
  const probes = [...d.probes, ...INVARIANTS];
  for (const p of probes) {
    if (!supported.has(p.kind)) { out.na++; continue; }
    const a = byId.get(p.id);
    // the adapter declared this kind: it must answer present or absent
    if (!a) { out.failures.push({ id: p.id, kind: p.kind, status: 'error', got: 'no answer for a probe kind the adapter declares' }); continue; }
    if (a.status === 'unsupported') { out.failures.push({ id: p.id, kind: p.kind, status: 'error', got: `answered unsupported for a declared kind: ${a.value ?? ''}` }); continue; }
    if (a.status === 'error') { out.failures.push({ id: p.id, kind: p.kind, status: 'error', got: a.value }); continue; }
    if (p.kind === 'facts.extra') { // nothing stored that the ledger does not state, and nothing stored twice
      const want = new Map();
      for (const q of d.probes) if (EXTRA_KINDS.includes(q.kind)) want.set(factKey(q), (want.get(factKey(q)) ?? 0) + (d.fact_counts?.[q.id] ?? 1));
      const have = new Map();
      for (const f of a.value ?? []) have.set(factKey(f), (have.get(factKey(f)) ?? 0) + 1);
      const extra = [...have].filter(([k, n]) => n > (want.get(k) ?? 0)).map(([k, n]) => ({ fact: k, stored: n, stated: want.get(k) ?? 0 }));
      if (extra.length) out.failures.push({ id: p.id, kind: p.kind, status: 'mishandled', expect: 'only facts the ledger states, as often as it states them', got: extra });
      else out.pass++;
      continue;
    }
    if (p.kind === 'addresses.valid') {
      const known = new Set(d.addresses), bad = (a.value ?? []).filter((x) => x.startsWith('raw:') || !known.has(x));
      if (bad.length) out.failures.push({ id: p.id, kind: p.kind, status: 'mishandled', expect: 'every stored address decodes and is named by the ledger', got: bad });
      else out.pass++;
      continue;
    }
    if (p.expect === null) { // the entry is gone at the end of the ledger: nothing may be stored for it
      if (a.status === 'absent') out.pass++;
      else out.failures.push({ id: p.id, kind: p.kind, status: 'mishandled', expect: null, got: a.value });
      continue;
    }
    if (a.status === 'absent') out.failures.push({ id: p.id, kind: p.kind, status: 'dropped', expect: p.expect });
    else if (String(a.value) === String(p.expect)) out.pass++;
    else out.failures.push({ id: p.id, kind: p.kind, status: 'mishandled', expect: p.expect, got: a.value });
  }
  return out;
}

async function session(s, n) {
  const id = `${opt.target.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10)}_${s.sha256.slice(0, 10)}_${NETWORK[s.passphrase].slice(0, 1)}${s.control ? 'c' : ''}${n}`;
  let d, mock;
  try {
    d = derived(s);
    const bytes = variantBytes(s.path);
    mock = await startMockRpc({ ledgers: [{ seq: d.ledger_seq, bytes, hash: d.hash, closeTime: d.close_time, headerXdr: Buffer.from(d.header_xdr, 'base64'), state: d.state }], passphrase: s.passphrase, protocol: d.protocol });
  } catch (e) { // the ledger could not be read or served: a harness failure, never the indexer's
    return { session: id, sha256: s.sha256, variants: s.vids, control: s.control, verdict: 'error', error: `harness: ${e.message ?? e}`, attempts: [] };
  }
  const env = {
    XDRPROOF_SESSION_ID: id, XDRPROOF_FIRST_LEDGER: String(d.ledger_seq), XDRPROOF_LAST_LEDGER: String(d.ledger_seq),
    XDRPROOF_NETWORK: NETWORK[s.passphrase], XDRPROOF_NETWORK_PASSPHRASE: s.passphrase,
    XDRPROOF_RPC_URL: `http://127.0.0.1:${mock.port}`, XDRPROOF_RPC_URL_DOCKER: `http://host.docker.internal:${mock.port}`,
    XDRPROOF_ARCHIVE_URL: `http://127.0.0.1:${mock.port}/archive`, XDRPROOF_ARCHIVE_URL_DOCKER: `http://host.docker.internal:${mock.port}/archive`,
  };
  const rec = { session: id, sha256: s.sha256, variants: s.vids, control: s.control, ledger: d.ledger_seq, protocol: d.protocol, network: NETWORK[s.passphrase], tx_count: d.tx_count, attempts: [] };
  const logFile = join(OUT, 'sessions', `${id}.log`);
  const t0 = Date.now();
  try {
    await must('prepare', env, { timeoutS: 120 });
    let a = await supervise(env, mock, d.ledger_seq, logFile);
    rec.attempts.push(a);
    if (!a.passed) { // one restart on the same store: does it get past the ledger now?
      a = await supervise(env, mock, d.ledger_seq, logFile);
      rec.attempts.push(a);
    }
    rec.memory_peak_bytes = Math.max(...rec.attempts.map((x) => x.memory_peak_bytes ?? 0)) || null;
    if (rec.attempts.some((x) => x.reason === 'adapter')) throw new Error(rec.attempts.find((x) => x.reason === 'adapter').error);
    const first = rec.attempts[0], passedFirst = first.passed && !first.exited_after_commit, passedEver = rec.attempts.some((x) => x.passed);
    if (passedEver) {
      const o = await must('observe', env, { input: JSON.stringify({ probes: d.probes.filter((p) => supported.has(p.kind)).concat(INVARIANTS.filter((p) => supported.has(p.kind))) }), timeoutS: 300 });
      const obs = JSON.parse(o.stdout);
      const j = judge(d, obs.answers);
      rec.tables = obs.tables;
      rec.probes = { total: d.probes.length + INVARIANTS.length, pass: j.pass, not_applicable: j.na, failed: j.failures.length };
      rec.failures = j.failures;
      const worst = j.failures.some((f) => f.status === 'error') ? 'error' : j.failures.some((f) => f.status === 'mishandled') ? 'mishandled' : j.failures.some((f) => f.status === 'dropped') ? 'dropped' : 'handled';
      // the first attempt exited on the ledger (before or after committing it): crashed; it stopped making
      // progress without exiting and the restart got past: stalled
      rec.verdict = worst === 'error' ? 'error' : passedFirst ? worst : first.exited_after_commit || first.reason === 'exited' ? 'crashed' : 'stalled';
    } else rec.verdict = 'halted';
  } catch (e) {
    rec.verdict = 'error'; rec.error = String(e.message ?? e);
  } finally {
    rec.requests = mock.stats.byMethod;
    rec.unserved = [...mock.stats.unserved];
    // ledger entries the indexer read that the corpus does not hold (answered "not found"; recorded)
    rec.unknown_keys = [...mock.stats.unknownKeys]; // decoded after the run
    rec.ttl_unknown = mock.stats.ttlUnknown.size;
    rec.delivered = mock.stats.delivered.has(d.ledger_seq);
    writeFileSync(join(OUT, 'sessions', `${id}.mock.json`), JSON.stringify(mock.log));
    await mock.close();
    if (!opt.keep) await run('finish', env, { timeoutS: 60 });
    rec.ms = Date.now() - t0;
  }
  return rec;
}

async function pool(items, jobs, fn) {
  const out = new Array(items.length); let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (i < items.length) {
      const k = i++; out[k] = await fn(items[k], k);
      done++; if (process.stderr.isTTY || done % 10 === 0 || done === items.length) process.stderr.write(`\r  ${done}/${items.length} sessions`);
    }
  }));
  if (items.length) process.stderr.write('\n');
  return out;
}

// ---- run --------------------------------------------------------------------------------------------------
const list = [...sessions.values()];
console.log(`${A.name}@${opt.target} (${T.ref.slice(0, 12)}, protocol_max ${T.protocol_max}): ${variants.length} variants, ${list.length} sessions, ${[...verdicts.values()].length} unsupported`);
try { await must('setup', {}, { timeoutS: A.timeouts?.setup_s ?? 1200 }); } catch (e) { die(e.message); }

// read every ledger first (synchronous native calls; cached across runs)
for (const s of [...controlSessions, ...sessions.values()]) { try { prepareDerived(s); } catch { /* reported by its session */ } }
const ctl = await pool(controlSessions, Number(opt.jobs), session);
for (const c of ctl) {
  console.log(`  control ${c.control}: ${c.verdict}${c.error ? ` (${c.error})` : ''}`);
  if (!['handled', 'dropped', 'mishandled'].includes(c.verdict)) die(`control ${c.control} did not get past its ledger (${c.verdict}): the setup, not a finding; see ${OUT}/sessions/${c.session}.log`);
}
const recs = await pool(list, Number(opt.jobs), session);
for (const r of recs) for (const vid of r.variants) verdicts.set(vid, r);
const keyJson = new Map();
for (const r of [...ctl, ...recs]) r.unknown_keys = (r.unknown_keys ?? []).map((k) => {
  if (!keyJson.has(k)) { try { keyJson.set(k, decodeXdr('LedgerKey', k)); } catch { keyJson.set(k, k); } }
  return keyJson.get(k);
});
if (!opt.keep) await run('teardown', {}, { timeoutS: 60 });

// ---- expectations -----------------------------------------------------------------------------------------
const EXP = join(HERE, 'expectations', `${A.name}@${opt.target}.json`);
const exp = existsSync(EXP) ? JSON.parse(readFileSync(EXP, 'utf8')) : { verdicts: {} };
if (existsSync(EXP) && exp.ref !== T.ref) die(`${EXP} was recorded at ${exp.ref}, the target is ${T.ref}: re-record it`);
const kinds = (r) => [...new Set((r.failures ?? []).map((f) => f.kind))].sort();
const failedIds = (r) => [...new Set((r.failures ?? []).map((f) => f.id))].sort(); // the exact facts, not just their kind
const diffs = [];
for (const [vid, r] of [...verdicts].sort(([a], [b]) => (a < b ? -1 : 1))) {
  if (r.verdict === 'unsupported') continue;
  const want = exp.verdicts[vid] ?? { verdict: 'handled', failed: [] };
  const got = { verdict: r.verdict, failed: failedIds(r) };
  if (want.verdict !== got.verdict || JSON.stringify(want.failed ?? []) !== JSON.stringify(got.failed)) diffs.push({ vid, want, got });
}
for (const vid of Object.keys(exp.verdicts)) if (!verdicts.has(vid) && !partial) diffs.push({ vid, want: exp.verdicts[vid], got: { verdict: 'missing' } });
// the set of variants judged must be the recorded one: a variant cannot drop out (a lowered protocol_max,
// a removed or renamed variant) without failing the run
const judgedList = [...verdicts].filter(([, r]) => r.verdict !== 'unsupported').map(([v]) => v).sort();
const judged = { count: judgedList.length, sha256: sha(judgedList.join('\n')) };
const unsupportedList = [...verdicts].filter(([, r]) => r.verdict === 'unsupported').map(([v]) => v).sort();
if (!partial && (exp.judged?.count !== judged.count || exp.judged?.sha256 !== judged.sha256))
  diffs.push({ vid: '(the set of judged variants)', want: { verdict: `${exp.judged?.count ?? 'none recorded'}` }, got: { verdict: `${judged.count} (${judged.sha256.slice(0, 12)})` } });
if (!partial && JSON.stringify(exp.unsupported ?? []) !== JSON.stringify(unsupportedList))
  diffs.push({ vid: '(the unsupported variants)', want: { verdict: `${(exp.unsupported ?? []).length}` }, got: { verdict: `${unsupportedList.length}` } });

// ---- report -----------------------------------------------------------------------------------------------
const count = {};
for (const r of verdicts.values()) count[r.verdict] = (count[r.verdict] ?? 0) + 1;
const report = { schema: 'xdrproof.replay-report/v1', adapter: A.name, target: opt.target, ref: T.ref, protocol_max: T.protocol_max, at: new Date().toISOString(),
  counts: count, harness_peak_rss_bytes: process.resourceUsage().maxRSS * 1024, derive_child_peak_rss_bytes: deriveChildPeak || null, controls: ctl, sessions: recs, unsupported: Object.fromEntries([...verdicts].filter(([, r]) => r.verdict === 'unsupported').map(([k, r]) => [k, r.why])) };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const bad = [...verdicts].filter(([, r]) => !['handled', 'unsupported'].includes(r.verdict)).sort(([a, x], [b, y]) => SEVERITY.indexOf(y.verdict) - SEVERITY.indexOf(x.verdict) || (a < b ? -1 : 1));
const md = [`# ${A.name}@${opt.target} (${T.ref.slice(0, 12)})`, '', `Variants: ${verdicts.size}. ` + Object.entries(count).map(([k, v]) => `${k} ${v}`).join(', ') + '.', '',
  '| Variant | Verdict | Probes that failed |', '|---|---|---|',
  ...bad.map(([vid, r]) => `| \`${vid}\` | ${r.verdict} | ${kinds(r).join(', ') || (r.error ?? r.attempts?.map((a) => a.reason ?? 'passed').join(' → ') ?? '')} |`)];
writeFileSync(join(OUT, 'summary.md'), md.join('\n') + '\n');
console.log(`\n${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(', ')}   (${OUT}/report.json; harness peak RSS ${(report.harness_peak_rss_bytes / 2 ** 20).toFixed(0)} MiB)`);
const unknown = new Map();
for (const r of recs) for (const k of r.unknown_keys ?? []) { const t = typeof k === 'string' ? k : Object.keys(k)[0]; unknown.set(t, (unknown.get(t) ?? 0) + 1); }
if (unknown.size) console.log(`  the indexer read ledger entries the corpus does not hold: ${[...unknown].map(([t, n]) => `${t} x${n}`).join(', ')} (answered not found)`);
const unserved = new Set(recs.flatMap((r) => r.unserved ?? []));
if (unserved.size) console.log(`  the indexer asked the mock for: ${[...unserved].join(', ')} (refused; recorded per session)`);
const halts = recs.filter((r) => ['halted', 'crashed', 'stalled'].includes(r.verdict));
if (halts.length && opt.target === 'main') console.log(`\n  ${halts.length} session(s) halted, crashed or stalled on ${opt.target}: triage under findings/policy.md before anything is committed.`);

const caveated = recs.filter((r) => !['handled', 'unsupported'].includes(r.verdict) && (r.unknown_keys?.length || r.ttl_unknown || r.unserved?.length));
if (caveated.length) console.log(`  ${caveated.length} non-handled session(s) also read state the mock lacks (unknown keys, TTLs or methods): their causes must be traced in code, not to the mock`);
if (opt.record) {
  const draft = { adapter: A.name, target: opt.target, ref: T.ref, judged, unsupported: unsupportedList, verdicts: {} };
  for (const [vid, r] of [...verdicts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (['handled', 'unsupported'].includes(r.verdict)) continue;
    draft.verdicts[vid] = { verdict: r.verdict, failed: failedIds(r), why: exp.verdicts[vid]?.why ?? 'TODO', upstream: exp.verdicts[vid]?.upstream ?? null };
  }
  console.log(JSON.stringify(draft, null, 2));
}
if (diffs.length) {
  console.log(`\nMISMATCH: ${diffs.length} verdict(s) differ from ${EXP.replace(ROOT + '/', '')}`);
  for (const x of diffs.slice(0, 40)) console.log(`  ${x.vid}: expected ${x.want.verdict} [${(x.want.failed ?? []).length} failed], got ${x.got.verdict} [${(x.got.failed ?? []).length} failed]`);
}
// (6) an adapter or harness failure is never a finding: exit 2, whatever the expectations say
const errors = [...ctl, ...recs].filter((r) => r.verdict === 'error');
if (errors.length) {
  console.log(`\nERROR: ${errors.length} session(s) failed in the adapter or the harness, not in the indexer:`);
  for (const r of errors.slice(0, 10)) console.log(`  ${r.session} (${r.variants.join(', ') || r.control}): ${r.error ?? (r.failures ?? []).filter((f) => f.status === 'error').map((f) => `${f.id}: ${f.got}`).slice(0, 2).join('; ')}`);
  process.exit(2);
}
if (diffs.length) process.exit(1);
if (partial) console.log(`partial run (${judged.count} variants judged): each matches its expectation; the judged-set check needs a full run.`);
console.log(`OK: every verdict matches ${EXP.replace(ROOT + '/', '')}.`);
