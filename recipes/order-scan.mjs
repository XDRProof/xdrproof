#!/usr/bin/env node
// order-scan.mjs [<lane: classic|soroban> <runs> [protocol]] [--details]   env NET (mainnet), FLAGS (base), PAR (6)
// Runs one recipe configuration <runs> times from scratch, then records which ledgers come out in more than one
// byte ordering (tools/order-scan.mjs) into recipes/<lane>/order-scan/p<protocol>-<net>-<flags>.json.
// Entries take change_order (stable, normalised hash, raw orderings) from this file.
// With no lane, it scans both, as make order-scan does: classic 20 runs at P30, then soroban 20 runs at P30.
// recipes/order-scan.sh is kept as its old entry point.
import { mkdirSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { RECIPES, installOnce, runTrials, child } from './pool.mjs';
import { makeUI } from '../tools/ui.mjs';

const ui = makeUI(), T0 = Date.now();
const DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
const pos = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const NET = process.env.NET || 'mainnet', FLAGS = process.env.FLAGS || 'base', PAR = Math.max(1, Number(process.env.PAR) || 6);
const scans = pos.length ? [{ lane: pos[0], n: Number(pos[1]), proto: Number(pos[2] ?? 30) }] : [{ lane: 'classic', n: 20, proto: 30 }, { lane: 'soroban', n: 20, proto: 30 }];
for (const s of scans) {
  if (!['classic', 'soroban'].includes(s.lane) || !(s.n >= 2)) { console.error('usage: order-scan.mjs [<classic|soroban> <runs, at least 2> [protocol]] [--details]'); process.exit(2); }
  if (s.lane === 'classic' && s.proto !== 30) { console.error('the classic lane runs at P30 only'); process.exit(2); }
  s.cfg = `p${s.proto}-${NET}-${FLAGS}`;
  s.jobs = Array.from({ length: s.n }, (_, i) => ({ lane: s.lane, name: `os-${s.cfg}-${String(i + 1).padStart(String(s.n).length, '0')}`,
    port: (s.lane === 'soroban' ? 21900 : 21800) + i + 1, proto: s.proto, net: NET, flags: FLAGS }));
}
const runs = scans.reduce((n, s) => n + s.n, 0);
ui.header('order-scan', [`${runs} fresh stellar-core runs · ${scans.map((s) => `${s.lane} ${s.cfg}`).join(', ')}`, `${runs} fresh runs`, '']);
const rows = scans.map((s) => ui.task(`${s.lane[0].toUpperCase()}${s.lane.slice(1)} runs`, { since: T0, waiting: s !== scans[0] }).count(0, s.n));

try { await installOnce((t) => rows[0].note(t)); }
catch (e) { ui.clear(); ui.out('  ' + ui.bad(e.message)); ui.verdict('fail', 'ERROR', 'Could not install the recipes', Date.now() - T0); process.exit(2); }
const reports = [];
for (const [k, s] of scans.entries()) {
  let done = 0; rows[k].start().count(0, s.n);
  try { await runTrials(s.jobs, { par: PAR, onDone: () => rows[k].count(++done, s.n) }); }
  catch (e) {
    rows[k].fail(); ui.clear(); ui.out('  ' + ui.bad(`${e.job.name} failed`));
    for (const l of [...(e.output ? e.output.split('\n').slice(-6) : []), `log: ${e.log}`]) for (const w of ui.wrap(l, ui.width - 6)) ui.out('    ' + ui.dim(w));
    ui.verdict('fail', 'FAILED', 'A stellar-core run did not finish', Date.now() - T0);
    process.exit(1);
  }
  rows[k].note('comparing the runs');
  mkdirSync(join(RECIPES, s.lane, 'order-scan'), { recursive: true });
  const out = `${s.lane}/order-scan/${s.cfg}.json`;
  // the comparison writes beside the report, which it replaces only with a valid result: a failed comparison never
  // reads the last run's file, and never leaves the recorded report deleted
  const tmp = `${out}.new`; rmSync(join(RECIPES, tmp), { force: true });
  const r = await child('node', [join(RECIPES, '..', 'tools/order-scan.mjs'), tmp, ...s.jobs.map((j) => `${s.lane}/runs/${j.name}/lcm`)], { cwd: RECIPES });
  let rep = null; try { rep = JSON.parse(readFileSync(join(RECIPES, tmp), 'utf8')); } catch {}
  if (rep?.summary) renameSync(join(RECIPES, tmp), join(RECIPES, out)); else rmSync(join(RECIPES, tmp), { force: true });
  // tools/order-scan.mjs exits 1 only after writing a report whose content_varies says why; anything else is a failure
  if (!rep?.summary || (r.code !== 0 && !rep.summary.content_varies)) {
    rows[k].fail(); ui.clear(); ui.out('  ' + ui.bad(`${s.lane}: ${((r.err || r.out).trim().split('\n').pop()) || `the comparison exited ${r.code}`}`));
    ui.verdict('fail', 'FAILED', 'The runs could not be compared', Date.now() - T0); process.exit(1);
  }
  r.code === 0 ? rows[k].done() : rows[k].fail();
  reports.push({ s, rep, out });
}

// ---- one card per lane ----------------------------------------------------------------------------------------
ui.clear();
const narrow = ui.width < 60;
let bad = 0;
for (const { s, rep, out } of reports) {
  const x = rep.summary; bad += x.content_varies;
  ui.card({ title: `${s.lane} ${s.cfg} · ${rep.runs} runs`, score: `${x.ledgers - x.content_varies}/${x.ledgers}`, details: DETAILS, lines: [
    ...(x.content_varies ? [{ mark: '✗', text: `${x.content_varies} differ in content`, detail: rep.ledgers.filter((l) => Array.isArray(l.normalized_sha256)).map((l) => `ledger ${l.ledger}`) }] : []),
    { mark: '✓', text: narrow ? `${x.stable} identical every time` : `${x.stable} byte-identical in every run` },
    { mark: '✓', text: narrow ? `${x.order_varies} only reordered` : `${x.order_varies} differ only in the order of changes`, right: x.order_varies ? `up to ${x.max_orderings}` : '',
      detail: rep.ledgers.filter((l) => !l.stable).map((l) => `ledger ${l.ledger} ${l.steps.join(', ') || 'setup'}: ${l.raw.map((o) => o.runs).join('/')} runs`) },
  ], footer: DETAILS ? `written: recipes/${out}` : '' });
}
if (bad) { ui.verdict('fail', 'FAILED', `${bad} ledger${bad === 1 ? '' : 's'} differ in content between fresh runs`, Date.now() - T0); process.exit(1); }
ui.verdict('gold', 'PASSED', 'Only the order of changes varies, never the content.', Date.now() - T0);
if (!DETAILS) ui.hint('which ledgers, and how the runs split', 'make order-scan DETAILS=1');
