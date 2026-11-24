#!/usr/bin/env node
// make coverage: which union arms and enum members reachable from LedgerCloseMeta (stellar-xdr v30.0) the corpus
// bytes and the mined pubnet ledgers contain. The walker (xdrcov.py) reads XDR guided only by xdr.json, no SDK
// decoder involved. Every arm neither reaches must be classified in coverage/exclusions.json with the core source
// line that decides it; an unclassified one fails the run. Prints proof cards (tools/ui.mjs).
//   tools/coverage/run.sh [--details]          GOLDENS=1 adds stellar-core's own golden ledgers (downloads ~76 MB once)
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';
import { availableParallelism } from 'node:os';
import { makeUI } from '../ui.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), W = join(HERE, '.work');
const DEFS = join(HERE, 'defs', 'xdr-v30.0.json'), DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
const GOLDENS = process.env.GOLDENS === '1', GOLDEN_SHA = 'f2b91947fb20fc8174cca38bf320eda7baa3edbb';
const ui = makeUI(), T0 = Date.now(), WIDTH = ui.width, narrow = WIDTH < 64;

// ---- what this run checks, said at once ----------------------------------------------------------------------
// (the arm count comes with the walk; the cards show it)
ui.header('coverage', ['stellar-xdr v30.0 · union arms from LedgerCloseMeta', 'stellar-xdr v30.0', '']);

// the ledgers: entry variants stored raw (.xdr) or zstd-compressed (.xdr.zst, decompressed under .work), and the
// mined pubnet ledgers (compressed)
rmSync(join(W, 'entries'), { recursive: true, force: true }); rmSync(join(W, 'mined'), { recursive: true, force: true });
mkdirSync(join(W, 'entries'), { recursive: true }); mkdirSync(join(W, 'mined'), { recursive: true });
const entries = [];
for (const id of readdirSync(join(ROOT, 'entries')).sort()) {
  const dir = join(ROOT, 'entries', id);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.xdr')) entries.push(join(dir, f));
    else if (f.endsWith('.xdr.zst')) {
      mkdirSync(join(W, 'entries', id), { recursive: true });
      const out = join(W, 'entries', id, f.slice(0, -4)); writeFileSync(out, zstdDecompressSync(readFileSync(join(dir, f)))); entries.push(out);
    }
  }
}
const mined = readdirSync(join(ROOT, 'mined', 'ledgers')).filter((f) => f.endsWith('.zst')).sort().map((f) => {
  const out = join(W, 'mined', f.replace(/\.zst$/, '')); writeFileSync(out, zstdDecompressSync(readFileSync(join(ROOT, 'mined', 'ledgers', f)))); return out;
});
const groups = [
  { key: 'entries', label: 'Corpus entries', files: entries },
  { key: 'mined', label: 'Mined pubnet ledgers', files: mined },
];
const rows = Object.fromEntries(groups.map((g) => [g.key, ui.task(g.label, { since: T0 })]));
if (GOLDENS) rows.goldens = ui.task("stellar-core's golden ledgers", { waiting: true });

// ---- the walk: each group split across worker processes (the walker is pure Python, one core each) -----------
const WORKERS = Math.max(2, Math.min(6, Math.floor(availableParallelism() / 2)));
const children = new Set();
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { for (const c of children) c.kill(sig); ui.clear(); process.exit(sig === 'SIGINT' ? 130 : 143); });
function walkChunk(files, framed, onFile) {
  return new Promise((resolve, reject) => {
    const p = spawn('python3', ['-I', join(HERE, 'xdrcov.py'), 'walk', DEFS, 'LedgerCloseMeta', '--progress', ...(framed ? ['--framed'] : []), ...files]);
    children.add(p);
    let out = '', err = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => { const s = String(c); for (const l of s.split('\n')) if (l === 'walked') onFile(); else if (l) err += l + '\n'; });
    p.on('close', (code) => { children.delete(p); code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`the walker exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`)); });
  });
}
async function walk(g, framed = false) {
  // largest files first, dealt round-robin, so every worker gets a similar share of bytes
  const sized = g.files.map((f) => [f, statSync(f).size]).sort((a, b) => b[1] - a[1]);
  const n = Math.min(WORKERS, sized.length), chunks = Array.from({ length: n }, () => []);
  sized.forEach(([f], i) => chunks[i % n].push(f));
  let done = 0;
  const parts = await Promise.all(chunks.map((c) => walkChunk(c, framed, () => rows[g.key].count(++done, g.files.length))));
  // a member is missed by the group only when every part missed it
  const inAll = (lists) => lists.reduce((acc, l) => new Set(l.filter((x) => acc.has(x))), new Set(lists[0]));
  const r = { files: g.files.length, records: parts.reduce((n, p) => n + p.records, 0), errors: parts.flatMap((p) => p.errors),
    armsTotal: parts[0].arms_total, enumTotal: parts[0].enum_total,
    armsMissing: inAll(parts.map((p) => p.arms_missing)), enumMissing: inAll(parts.map((p) => p.enum_missing)) };
  r.errors.length ? rows[g.key].fail() : rows[g.key].done();
  return r;
}
// one failure path for every walk: the other workers are stopped before the run ends
const walkFailed = (e) => {
  for (const c of children) c.kill('SIGTERM');
  ui.clear(); ui.verdict('fail', 'FAILED', 'the walker did not finish', Date.now() - T0);
  ui.wrap(e.message, WIDTH - 4).forEach((l) => ui.out('  ' + ui.bad(l))); process.exit(2);
};
let res;
try { res = Object.fromEntries(await Promise.all(groups.map(async (g) => [g.key, await walk(g)]))); } catch (e) { walkFailed(e); }

if (GOLDENS) {
  const G = join(W, 'stellar-core');
  if (!existsSync(join(G, 'test-lcm-current'))) {
    rows.goldens.note('downloading (once, about 76 MB)');
    const git = (...a) => spawnSync('git', ['-C', G, ...a], { stdio: 'ignore' });
    mkdirSync(G, { recursive: true }); git('init', '-q'); git('remote', 'add', 'origin', 'https://github.com/stellar/stellar-core');
    git('sparse-checkout', 'set', 'test-lcm-current'); git('fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', GOLDEN_SHA);
    if (git('checkout', '-q', 'FETCH_HEAD').status !== 0) { ui.clear(); ui.verdict('fail', 'FAILED', "could not fetch stellar-core's golden ledgers", Date.now() - T0); process.exit(2); }
  }
  const files = [];
  const find = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) find(p); else if (f.endsWith('.xdr')) files.push(p); } };
  find(join(G, 'test-lcm-current'));
  try { res.goldens = await walk({ key: 'goldens', label: '', files }, true); } catch (e) { walkFailed(e); }
}
ui.clear();

// ---- what the corpus reaches, and what it does not ----------------------------------------------------------
const total = res.entries.armsTotal, enumTotal = res.entries.enumTotal;
const both = (k) => new Set([...res.entries[k]].filter((x) => res.mined[k].has(x)));
const armsMissing = both('armsMissing'), enumMissing = both('enumMissing');
const ex = JSON.parse(readFileSync(join(ROOT, 'coverage', 'exclusions.json'), 'utf8'));
const classOf = new Map(ex.arms.map((x) => [x.arm, x.class]));
const unclassified = [...armsMissing].filter((a) => !classOf.has(a)).sort();
const byClass = {};
for (const a of armsMissing) if (classOf.has(a)) byClass[classOf.get(a)] = (byClass[classOf.get(a)] ?? 0) + 1;
// plain words for the classes (coverage/exclusions.json says each in full)
const CLASS = {
  'validation-only': 'refused before a ledger closes', 'not-emitted': 'never written by core 30',
  historical: 'only in older protocols', 'network-only': 'need a live network: to be mined', todo: 'can be made: not in an entry yet',
};
const impossible = ['validation-only', 'not-emitted', 'historical'].reduce((n, c) => n + (byClass[c] ?? 0), 0);
const errors = [...res.entries.errors, ...res.mined.errors, ...(res.goldens?.errors ?? [])];

const line = (mark, text, right = '', detail) => ({ mark, text, right: String(right), detail });
const breakdown = ['validation-only', 'not-emitted', 'historical'].filter((c) => byClass[c]).map((c) => `${byClass[c]} ${CLASS[c]}`);
const cards = [
  { title: 'Union arms', score: `${total - armsMissing.size}/${total}`, lines: [
    line('✓', narrow ? 'in corpus entries' : 'in the corpus entries', total - res.entries.armsMissing.size),
    line('✓', narrow ? 'in mined ledgers' : 'in the mined pubnet ledgers', total - res.mined.armsMissing.size),
    ...(res.goldens ? [line('✓', narrow ? "in core's goldens" : "in stellar-core's golden ledgers", total - res.goldens.armsMissing.size)] : []),
    ...(impossible ? [line('✓', narrow ? 'cannot appear at P30' : 'cannot appear at protocol 30, each with its reason', impossible, breakdown)] : []),
    ...(byClass['network-only'] ? [line('!', narrow ? 'need a live network' : CLASS['network-only'], byClass['network-only'])] : []),
    ...(byClass.todo ? [line('!', narrow ? 'not in an entry yet' : CLASS.todo, byClass.todo)] : []),
    ...(unclassified.length ? [line('✗', narrow ? 'not reached, no reason' : 'not reached and not classified', unclassified.length, unclassified)] : []),
    ...(errors.length ? [line('✗', narrow ? 'ledgers not walked' : 'ledgers the walker could not read', errors.length)] : []),
  ] },
  { title: 'Enum members', score: `${enumTotal - enumMissing.size}/${enumTotal}`, lines: [
    line('✓', narrow ? 'in corpus entries' : 'in the corpus entries', enumTotal - res.entries.enumMissing.size),
    line('✓', narrow ? 'in mined ledgers' : 'in the mined pubnet ledgers', enumTotal - res.mined.enumMissing.size),
    ...(res.goldens ? [line('✓', narrow ? "in core's goldens" : "in stellar-core's golden ledgers", enumTotal - res.goldens.enumMissing.size)] : []),
  ] },
];
// a failure first, then known gaps, then the clean cards
cards.sort((a, b) => ui.rank(a.lines) - ui.rank(b.lines));
for (const c of cards) ui.card({ ...c, details: DETAILS });
if (DETAILS) {
  ui.out();
  const walked = [`${res.entries.files} entry files`, `${res.mined.files} mined ledgers`, ...(res.goldens ? [`${res.goldens.records} golden ledgers`] : [])].join(' · ');
  for (const t of [`walked ${walked} with ${WORKERS} workers`, 'every arm with its reason or the entries that reach it: COVERAGE.md']) ui.out('  ' + ui.dim(ui.trunc(t, WIDTH - 4)));
}
const problems = [...unclassified.map((a) => `${a}: no entry reaches it and coverage/exclusions.json does not classify it`), ...errors.map(([f, e]) => `${f.replace(ROOT + '/', '')}: ${e}`)];
if (problems.length) {
  ui.section('problems');
  for (const p of problems.slice(0, DETAILS ? 40 : 10)) ui.wrap(p, WIDTH - 6).forEach((l, i) => ui.out((i ? '      ' : '    ') + ui.bad(l)));
  if (problems.length > (DETAILS ? 40 : 10)) ui.out('    ' + ui.dim(`… and ${problems.length - (DETAILS ? 40 : 10)} more`));
  ui.verdict('fail', 'FAILED', `${problems.length} problem${problems.length === 1 ? '' : 's'}`, Date.now() - T0);
  process.exit(1);
}
ui.verdict('gold', 'PASSED', WIDTH >= 60 ? 'Every arm is reached or explained.' : 'Every arm explained.', Date.now() - T0);
if (!DETAILS) ui.out(`  ${ui.dim(narrow ? 'more:' : 'the reasons, by kind:')}  make coverage DETAILS=1`);
