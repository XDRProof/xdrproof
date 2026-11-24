#!/usr/bin/env node
// regenerate.mjs [--details]: every generated run from scratch, twice each, with a bare standalone stellar-core
// v30.0.0 (no RPC, no network, no keys or funds): both lanes, both passphrases, Soroban at P30 and P28, and the
// galexie and bare emitter-flag profiles. Each pair must agree (byte-identical, or the same content after
// change-order normalisation), and every shipped generated variant must be reproduced; the list of shipped variants
// is read from entries/*/entry.json (tools/shipped-checks.mjs).
//
// Needs: Docker (the stellar/quickstart image pinned by digest in recipes/core-image supplies stellar-core v30.0.0),
// Node >= 22.15, curl, jq. Env: PAR=<n> fresh cores at once (default 6). QUICK=1 runs only the mainnet base P30 pairs.
// make generate runs this; recipes/regenerate.sh is kept as its old entry point.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECIPES, installOnce, runTrials, child } from './pool.mjs';
import { makeUI } from '../tools/ui.mjs';

const ui = makeUI(), T0 = Date.now();
const DETAILS = process.argv.includes('--details') || process.argv.includes('-v'), QUICK = !!process.env.QUICK;
const PAR = Math.max(1, Number(process.env.PAR) || 6);
const node = (script, args) => child('node', [join(RECIPES, '..', 'tools', script), ...args], { cwd: RECIPES });

// ---- the matrix (unchanged from the shell version) -------------------------------------------------------------
const pairs = [], jobs = []; let port = 21700;
const add = (lane, proto, net, flags) => {
  const tag = `${lane}-p${proto}-${net}-${flags}`; pairs.push({ lane, proto, net, flags, tag });
  for (const r of [1, 2]) jobs.push({ lane, name: `g-${tag}-${r}`, port: port++, proto, net, flags });
};
add('classic', 30, 'mainnet', 'base'); add('soroban', 30, 'mainnet', 'base');
if (!QUICK) {
  add('classic', 30, 'testnet', 'base'); add('classic', 30, 'mainnet', 'galexie'); add('classic', 30, 'mainnet', 'bare');
  add('soroban', 30, 'testnet', 'base'); add('soroban', 28, 'mainnet', 'base'); add('soroban', 28, 'testnet', 'base');
  add('soroban', 30, 'mainnet', 'galexie'); add('soroban', 30, 'mainnet', 'bare');
}
const label = (p) => `${p.lane} P${p.proto} ${p.net}${p.flags === 'base' ? '' : ' ' + p.flags}`;

ui.header(QUICK ? 'generate-quick' : 'generate', [`${jobs.length} fresh stellar-core runs · ${pairs.length} configurations, each twice`, `${jobs.length} fresh runs`, '']);
const lanes = ['classic', 'soroban'].filter((l) => jobs.some((j) => j.lane === l));
const rows = Object.fromEntries(lanes.map((l) => [l, ui.task(`${l[0].toUpperCase()}${l.slice(1)} runs`, { since: T0 })]));
const rowCmp = ui.task('Comparing each pair', { waiting: true });
const done = Object.fromEntries(lanes.map((l) => [l, 0])), total = Object.fromEntries(lanes.map((l) => [l, jobs.filter((j) => j.lane === l).length]));
for (const l of lanes) rows[l].count(0, total[l]);

const fail = (title, lines) => {
  ui.clear(); ui.out('  ' + ui.bad(title));
  for (const l of lines) for (const w of ui.wrap(l, ui.width - 6)) ui.out('    ' + ui.dim(w));
  ui.verdict('fail', 'FAILED', 'A stellar-core run did not finish', Date.now() - T0);
  process.exit(1);
};
try { await installOnce((t) => rows[lanes[0]].note(t)); }
catch (e) { ui.clear(); ui.out('  ' + ui.bad(e.message)); ui.verdict('fail', 'ERROR', 'Could not install the recipes', Date.now() - T0); process.exit(2); }
try {
  await runTrials(jobs, { par: PAR, onDone: (j) => { rows[j.lane].count(++done[j.lane], total[j.lane]); if (done[j.lane] === total[j.lane]) rows[j.lane].done(); } });
} catch (e) {
  rows[e.job.lane].fail();
  fail(`${e.job.name} failed`, [...(e.output ? e.output.split('\n').slice(-6) : []), `log: ${e.log}`]);
}

// ---- compare each pair, and check every shipped generated variant it should reproduce -------------------------
rowCmp.start(); let compared = 0;
const results = await Promise.all(pairs.map(async (p) => {
  const checks = await node('shipped-checks.mjs', [p.lane, String(p.proto), p.net, p.flags]);
  if (checks.code !== 0) return { p, error: (checks.err || checks.out).trim() };
  const wanted = checks.out.trim().split(/\s+/).filter(Boolean);
  const c = await node('compare.mjs', [`${p.lane}/runs/g-${p.tag}-1/lcm`, `${p.lane}/runs/g-${p.tag}-2/lcm`, ...wanted]);
  writeFileSync(join(RECIPES, p.lane, 'runs', `g-${p.tag}-compare.txt`), c.out);
  rowCmp.count(++compared, pairs.length);
  const m = c.out.match(/(\d+) ledgers: (\d+) byte-identical, (\d+) identical after normalisation, (\d+) different/);
  const shipped = [...c.out.matchAll(/^ {2}(\S+@\S+): (byte-identical|same content \(other change order\)|NOT REPRODUCED|no such variant)/gm)].map((x) => ({ id: x[1], ok: !/NOT|no such/.test(x[2]) }));
  // a comparison that did not finish, or did not report every check it was given, is a failure, never a pass
  const incomplete = !m || shipped.length !== wanted.length || (c.code !== 0 && !(+m[4]) && shipped.every((x) => x.ok));
  return { p, code: c.code, ledgers: +m?.[1] || 0, raw: +m?.[2] || 0, norm: +m?.[3] || 0, differ: m ? +m[4] : 0, shipped, wanted: wanted.length, incomplete,
    error: incomplete ? `the comparison did not finish (exit ${c.code}${m ? `, ${shipped.length} of ${wanted.length} checks reported` : ''}): ${(c.err || c.out).trim().split('\n').pop() ?? ''}` : null, out: c.out };
}));
rowCmp.done();
// every shipped generated variant must belong to some pair (QUICK runs only part of the matrix)
const assigned = QUICK ? null : await node('shipped-checks.mjs', ['--assigned', ...pairs.map((p) => `${p.lane} ${p.proto} ${p.net} ${p.flags}`)]);
// the same ledger under the three flag profiles: same header hash, different meta (H-F9), recorded per lane
const profiles = QUICK ? [] : await Promise.all(['classic', 'soroban'].map(async (lane) => {
  const out = `${lane}/profiles/p30-mainnet.json`;
  const r = await node('profile-compare.mjs', [out, ...['base', 'galexie', 'bare'].map((f) => `${f}=${lane}/runs/g-${lane}-p30-mainnet-${f}-1/lcm`)]);
  let s = null; try { s = JSON.parse(readFileSync(join(RECIPES, out), 'utf8')).summary; } catch {}
  return { lane, code: r.code, s, msg: (r.err || r.out).trim() };
}));

// ---- the cards ------------------------------------------------------------------------------------------------
ui.clear();
const narrow = ui.width < 60, problems = [];
const pairLines = results.map((r) => {
  if (r.error) { problems.push(`${label(r.p)}: ${r.error}`); return { mark: '✗', text: label(r.p), right: 'error' }; }
  if (r.differ) problems.push(`${label(r.p)}: ${r.differ} ledger(s) differ between the two runs (recipes/${r.p.lane}/runs/g-${r.p.tag}-compare.txt)`);
  return { mark: r.differ ? '✗' : '✓', text: label(r.p), right: r.differ ? `${r.differ} differ` : r.norm ? 'reordered' : 'identical',
    detail: `${r.ledgers} ledgers: ${r.raw} byte-identical, ${r.norm} the same after sorting the changes` };
});
const okPairs = pairLines.filter((l) => l.mark === '✓').length;
const shipped = results.flatMap((r) => r.shipped ?? []), notRepro = shipped.filter((x) => !x.ok);
for (const x of notRepro) problems.push(`${x.id}: the corpus bytes were not made again`);
const unassigned = assigned && assigned.code !== 0 ? [...assigned.out.matchAll(/not reproduced by any run in this matrix: (\S+)/g)].map((x) => x[1]) : [];
for (const x of unassigned) problems.push(`${x}: no run in the matrix makes it`);
if (assigned && assigned.code !== 0 && !unassigned.length) problems.push(`shipped-checks --assigned: ${(assigned.err || assigned.out).trim()}`);
const cards = [
  { title: narrow ? 'Each run twice, the same' : 'Each configuration run twice, the same', score: `${okPairs}/${pairs.length}`, lines: pairLines },
  { title: narrow ? 'Corpus ledgers made again' : 'Corpus ledgers made again', score: `${shipped.length - notRepro.length}/${shipped.length}`, lines: [
    ...(notRepro.length ? [{ mark: '✗', text: `${notRepro.length} not made again`, detail: notRepro.map((x) => x.id) }] : []),
    ...(unassigned.length ? [{ mark: '✗', text: `${unassigned.length} made by no run in the matrix`, detail: unassigned }] : []),
    ...(!notRepro.length ? [{ mark: '✓', text: narrow ? 'every generated ledger' : 'every generated ledger in the corpus, from scratch' }] : []),
  ], footer: QUICK ? (narrow ? 'quick: mainnet P30 only' : 'quick run: the mainnet base P30 pairs only') : '' },
];
if (profiles.length) {
  const lines = profiles.map((x) => {
    if (x.code !== 0 || !x.s) problems.push(`${x.lane} flag profiles: ${x.msg.split('\n').filter((l) => /DIFFERS|different|usage|Error/i.test(l)).slice(0, 3).join('; ') || 'failed'}`);
    return { mark: x.code === 0 && x.s ? '✓' : '✗', text: narrow ? `${x.lane}: same ledgers` : `${x.lane}: the same ledgers under 3 flag sets`, right: x.s ? `${x.s.same_header_hash}/${x.s.ledgers}` : '',
      detail: x.s ? `meta differs: ${Object.entries(x.s.content_differs_by_pair).map(([k, v]) => `${k} in ${v}`).join(', ')}` : '' };
  });
  cards.push({ title: narrow ? 'Flag profiles' : 'Emitter flag profiles', score: `${lines.filter((l) => l.mark === '✓').length}/${lines.length}`, lines });
}
cards.sort((a, b) => ui.rank(a.lines) - ui.rank(b.lines));
for (const c of cards) ui.card({ ...c, details: DETAILS });
if (problems.length) {
  ui.out();
  const cap = DETAILS ? 40 : 10;
  for (const p of problems.slice(0, cap)) ui.out('    ' + ui.bad(ui.trunc(p, ui.width - 6)));
  if (problems.length > cap) ui.out('    ' + ui.dim(`… and ${problems.length - cap} more (DETAILS=1)`));
  ui.verdict('fail', 'FAILED', `${problems.length} problem${problems.length === 1 ? '' : 's'}`, Date.now() - T0);
  process.exit(1);
}
ui.verdict('gold', 'PASSED', QUICK ? 'The mainnet P30 ledgers were made again from scratch.' : 'Every generated ledger was made again from scratch.', Date.now() - T0);
if (!DETAILS) ui.hint('ledger counts per pair', `make ${QUICK ? 'generate-quick' : 'generate'} DETAILS=1`);
