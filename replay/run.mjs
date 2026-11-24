#!/usr/bin/env node
// make replay: the whole corpus against wallet-backend main, then every sighting at the commits before and after
// its fix (replay/sightings.json). Every verdict must match replay/expectations/. Each harness run's full output
// goes to replay/.work/logs/<target>.log; the result is printed once at the end as proof cards (summary.mjs).
// While it runs, a live block shows one row per card: the corpus into main (its sessions, or the step it is on),
// and the fixes (which commit, and its step). A full, passing `all` run also rewrites the recorded matrix,
// replay/recorded/wallet-backend.md; a partial or failing run never touches it.
// Needs Docker, Node >= 22.15 and the native reader.
//   replay/run.sh [all|main|sightings] [--details] [harness options, e.g. --jobs 8]
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUI } from '../tools/ui.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), ADAPTER = 'wallet-backend';
const argv = process.argv.slice(2);
const what = ['all', 'main', 'sightings'].includes(argv[0]) ? argv.shift() : 'all';
const details = argv.includes('--details'), pass = argv.filter((a) => a !== '--details');
const START = Date.now(), LOGS = join(HERE, '.work', 'logs');
mkdirSync(LOGS, { recursive: true });
const ui = makeUI();
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---- what this run checks, said at once ----------------------------------------------------------------------
const exp = json(join(HERE, 'expectations', `${ADAPTER}@main.json`));
const ledgers = (exp.judged?.count ?? 0) + (exp.unsupported?.length ?? 0);
const sightings = json(join(HERE, 'sightings.json')).sightings;
const commits = [...new Set(sightings.flatMap((s) => Object.keys(s.verdicts)))];
const issuesAt = (c) => [...new Set(sightings.filter((s) => c in s.verdicts).map((s) => `#${s.issue.match(/(\d+)$/)[1]}`))].join(' ');
const fixes = new Set(sightings.map((s) => s.issue)).size;
const doMain = what !== 'sightings', doFixes = what !== 'main';
ui.header('replay', [[ADAPTER, doMain && `${ledgers} ledgers`, doFixes && `${fixes} upstream fixes`].filter(Boolean).join(' · '),
  [doMain && `${ledgers} ledgers`, doFixes && `${fixes} fixes`].filter(Boolean).join(' · '), '']);
const rows = {
  main: doMain ? ui.task('Every ledger into main', { since: START }) : null,
  fixes: doFixes ? ui.task(`Before and after ${fixes} fixes`, { waiting: doMain }) : null,
};

// ---- one harness run per target; its progress comes back over IPC, its output goes to its log ------------------
// Each harness runs in a process group of its own (detached), so a stop reaches everything under it: the adapter's
// setup shell, the Docker clients, a Go build. Ctrl-C reaches only this process; it passes the signal on.
const children = new Set();
let stopping = false;
function harness(target, extra, onMsg) {
  return new Promise((resolve) => {
    const log = openSync(join(LOGS, `${target}.log`), 'w');
    const p = spawn(process.execPath, [join(HERE, 'harness.mjs'), '--adapter', ADAPTER, '--target', target, ...extra, ...pass],
      { cwd: ROOT, detached: true, stdio: ['ignore', log, log, 'ipc'], env: { ...process.env, XDRPROOF_START: String(START), XDRPROOF_PARTS: what } });
    children.add(p);
    p.on('message', onMsg);
    // once a stop has begun the run never moves on: only the signal handler below ends the process
    p.on('exit', (code, sig) => { children.delete(p); closeSync(log); if (!stopping) resolve(sig ? 2 : code ?? 2); });
  });
}
const killGroup = (pgid, sig) => { try { process.kill(-pgid, sig); } catch { /* the group is gone */ } };

// Ctrl-C or a kill: the signal is passed to each harness's process group (and SIGKILL after 5 s); then the
// adapter's teardown removes the containers and network a stopped harness leaves behind. The live block is erased.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, async () => {
  if (stopping) return; stopping = true;
  ui.clear();
  // the groups as they are now: a group outlives its leader, so its members still get the SIGKILL below even
  // after the harness itself has exited (taken once, at the stop, so no later reuse of a pid is ever signalled)
  const groups = [...children].map((c) => c.pid);
  for (const g of groups) killGroup(g, sig);
  const t0 = Date.now(); while (children.size && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 200));
  for (const g of groups) killGroup(g, 'SIGKILL');
  spawnSync('sh', ['-c', './teardown.sh'], { cwd: join(HERE, 'adapters', ADAPTER), stdio: 'ignore', env: { ...process.env, XDRPROOF_ADAPTER_WORK: join(HERE, '.work', ADAPTER) } });
  process.exit(sig === 'SIGINT' ? 130 : 143);
});

let failed = false;
if (doMain) {
  const code = await harness('main', [], (m) => (m.total ? rows.main.count(m.done, m.total) : m.note && rows.main.note(m.note)));
  failed ||= code !== 0;
  code === 0 ? rows.main.done() : rows.main.fail();
}
if (doFixes) {
  rows.fixes.start();
  for (const [k, c] of commits.entries()) {
    if (stopping) break;
    // the row says which fix and commit it is on, and that commit's step or sessions
    const at = `${issuesAt(c)} at ${c} (${k + 1} of ${commits.length})`;
    rows.fixes.note(at);
    const code = await harness(c, ['--sightings'], (m) => rows.fixes.note(`${at} · ${m.total ? `${m.done}/${m.total} sessions` : m.note}`));
    failed ||= code !== 0;
  }
  failed ? rows.fixes.fail() : rows.fixes.done();
}
ui.clear();

// the recorded matrix is the result of a full run that passed, never of a partial or failing one: every target's
// report must be from this run, cover the whole set (not --variants or --entries) and match its expectations
const complete = ['main', ...commits].every((t) => {
  try {
    const r = json(join(HERE, 'runs', `${ADAPTER}@${t}`, 'report.json'));
    return Date.parse(r.at) >= START && r.partial === false && !r.mismatches?.length && !r.errors?.length;
  } catch { return false; }
});
if (what === 'all' && !failed && complete) {
  const r = spawnSync(process.execPath, [join(HERE, 'matrix.mjs'), ADAPTER], { cwd: ROOT, maxBuffer: 1 << 26 });
  if (r.status === 0) { mkdirSync(join(HERE, 'recorded'), { recursive: true }); writeFileSync(join(HERE, 'recorded', `${ADAPTER}.md`), r.stdout); }
}

// ---- the cards ---------------------------------------------------------------------------------------------------
const s = spawnSync(process.execPath, [join(HERE, 'summary.mjs'), ADAPTER, ...(details ? ['--details'] : [])],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, XDRPROOF_START: String(START), XDRPROOF_PARTS: what, XDRPROOF_HEADER_DONE: '1' } });
process.exit(s.error || s.signal || s.status === null ? 2 : s.status || (failed ? 1 : 0));
