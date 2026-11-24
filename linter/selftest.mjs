#!/usr/bin/env node
// make lint-selftest: xplint against its seeded fixtures (every `// want RULE` marker must get a finding of that
// rule on that line, and no other line any) and its mutants (each removes a guard or puts a fixed bug back, and
// its rule must fire). Built and run in the pinned Go toolchain (linter/go.sh); printed as proof cards.
//   node linter/selftest.mjs [--details]          exit 0 all caught, 1 something missed, 2 the run failed
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUI } from '../tools/ui.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
const ui = makeUI(), T0 = Date.now(), WIDTH = ui.width, narrow = WIDTH < 64;

// ---- what it checks, said at once: counted from the fixtures and the mutants file ------------------------------
const markers = [], walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.go')) for (const m of readFileSync(p, 'utf8').matchAll(/\/\/ want ((?:XP00\d\/[a-z-]+ ?)+)\s*$/gm)) markers.push(...m[1].trim().split(/\s+/)); } };
walk(join(HERE, 'testdata', 'fixtures'));
const mutantCount = JSON.parse(readFileSync(join(HERE, 'testdata', 'mutations.json'), 'utf8')).length;
const rules = new Set(markers).size;
ui.header('lint-selftest', [`xplint · ${rules} rules · ${markers.length} seeded violations · ${mutantCount} mutants`, `xplint · ${markers.length} seeded violations · ${mutantCount} mutants`, `${markers.length} seeded · ${mutantCount} mutants`, '']);
const rows = { build: ui.task('Checking and building xplint', { since: T0 }), fixtures: ui.task('Seeded violations', { waiting: true }), mutants: ui.task('Mutants', { waiting: true }) };

// ---- the run: go vet, build, and the self-test with -json (progress on stderr) --------------------------------
const cmd = 'go vet ./... && go build -o /xdrproof/linter/.work/bin/xplint-selftest ./cmd/xplint-selftest && /xdrproof/linter/.work/bin/xplint-selftest -json';
const NAME = `xdrproof-selftest-${process.pid}`;
const p = spawn(join(HERE, 'go.sh'), ['sh', '-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, XDRPROOF_CONTAINER: NAME } });
// a stop removes the container itself, whether or not the signal reached the processes inside it
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { ui.clear(); p.kill(sig); spawnSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' }); process.exit(sig === 'SIGINT' ? 130 : 143); });
let out = '', said = '';
p.stdout.on('data', (c) => (out += c));
p.stderr.on('data', (c) => {
  for (const l of String(c).split('\n')) {
    const m = l.match(/^progress (\S+)(?: (\d+)\/(\d+))?$/);
    if (!m) { if (l.trim()) said += l + '\n'; continue; }
    if (m[1] === 'fixtures') { rows.build.done(); rows.fixtures.start(); }
    else if (m[1] === 'fixtures-done') rows.fixtures.done();
    else if (m[1] === 'mutant') rows.mutants.count(Number(m[2]), Number(m[3]));
  }
});
const code = await new Promise((r) => p.on('close', (c, sig) => r(sig ? 2 : c)));
ui.clear();
let rep = null;
try { rep = JSON.parse(out.trim().split('\n').pop()); } catch { /* the build or the run failed before the report */ }
if (!rep || code > 1) {
  ui.verdict('fail', 'FAILED', 'the self-test did not run', Date.now() - T0);
  for (const l of (said || out).trim().split('\n').slice(-8)) ui.out('  ' + ui.dim(ui.trunc(l, WIDTH - 4)));
  process.exit(2);
}

// ---- the cards ------------------------------------------------------------------------------------------------
const caughtM = rep.mutants.filter((m) => m.caught).length, n = rep.mutants.length;
const perRule = Object.entries(rep.per_rule).map(([r, k]) => `${r} ${k}`);
const cards = [
  { title: 'Seeded violations', score: `${rep.caught}/${rep.seeded}`, lines: [
    rep.missed.length ? { mark: '✗', text: `${rep.missed.length} missed`, right: rep.missed.length, detail: rep.missed }
      : { mark: '✓', text: narrow ? 'every one caught' : 'every seeded violation caught', right: rep.seeded, detail: perRule },
    rep.unexpected.length ? { mark: '✗', text: narrow ? 'flagged good lines' : 'findings on lines marked good', right: rep.unexpected.length, detail: rep.unexpected }
      : { mark: '✓', text: narrow ? 'no good line flagged' : 'no finding on a line marked good' },
  ] },
  { title: 'Mutants', score: `${caughtM}/${n}`, lines: [
    ...rep.mutants.filter((m) => !m.caught).map((m) => ({ mark: '✗', text: `${m.bad ? 'broken' : 'survived'}: ${m.name}`, right: m.expect.split('/')[0], detail: m.bad ?? m.why })),
    ...(caughtM ? [{ mark: '✓', text: caughtM === n ? (narrow ? 'every mutant caught' : 'every mutant makes its rule fire') : `${caughtM} caught`, right: caughtM,
      detail: rep.mutants.filter((m) => m.caught).map((m) => `${m.expect.split('/')[0]}  ${m.name}`) }] : []),
  ] },
];
cards.sort((a, b) => ui.rank(a.lines) - ui.rank(b.lines));
for (const c of cards) ui.card({ ...c, details: DETAILS });
const bad = rep.missed.length + rep.unexpected.length + (n - caughtM);
if (bad || code === 1) {
  ui.verdict('fail', 'FAILED', `${bad || 1} problem${bad === 1 ? '' : 's'}: see above`, Date.now() - T0);
  process.exit(1);
}
ui.verdict('gold', 'PASSED', WIDTH >= 60 ? 'xplint catches everything it should.' : 'All caught.', Date.now() - T0);
if (!DETAILS) ui.out(`  ${ui.dim(narrow ? 'more:' : 'every rule and mutant:')}  make lint-selftest DETAILS=1`);
