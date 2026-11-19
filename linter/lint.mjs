#!/usr/bin/env node
// lint.mjs: runs xplint on every target in linter/targets.json (codebases, a patched tree, the commits
// before and after upstream fixes, and mutants of wallet-backend main) and compares every finding with
// linter/expectations.json. Writes linter/recorded.md.
//
//   node linter/lint.mjs [--only <substring>] [--record]
//
// Exit 0 when every target matches its expectations and every mutant fires its rule; 1 otherwise; 2 when
// a target cannot be prepared or analysed.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..'), WORK = join(HERE, '.work');
const { values: opt } = parseArgs({ options: { only: { type: 'string' }, record: { type: 'boolean', default: false } } });
const T = JSON.parse(readFileSync(join(HERE, 'targets.json'), 'utf8'));
const EXP_FILE = join(HERE, 'expectations.json');
const EXP = existsSync(EXP_FILE) ? JSON.parse(readFileSync(EXP_FILE, 'utf8')) : { targets: {} };
const die = (m) => { console.error(`lint: ${m}`); process.exit(2); };
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 ** 28, ...o }).toString();
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80);

// ---- the linter binary, built in the pinned toolchain ------------------------------------------------
mkdirSync(join(WORK, 'bin'), { recursive: true });
sh(join(HERE, 'go.sh'), ['go', 'build', '-o', '/xdrproof/linter/.work/bin/xplint', './cmd/xplint']);

// ---- one target ----------------------------------------------------------------------------------------
function prepare(t) {
  const src = join(WORK, 'src', t.repo);
  if (!existsSync(join(src, '.git'))) {
    mkdirSync(dirname(src), { recursive: true });
    sh('git', ['clone', '-q', '--filter=blob:none', T.repos[t.repo], src]);
  }
  try { sh('git', ['-C', src, 'cat-file', '-e', `${t.ref}^{commit}`]); } catch { sh('git', ['-C', src, 'fetch', '-q', 'origin']); }
  const tree = join(WORK, 'trees', slug(t.name));
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });
  execFileSync('sh', ['-c', `git -C "${src}" archive "${t.ref}" | tar -x -C "${tree}"`]);
  for (const p of [t.patch, ...(t.patches ?? [])].filter(Boolean)) sh('git', ['apply', '-p1', join(HERE, p)], { cwd: tree });
  for (const e of t.edits ?? []) {
    const f = join(tree, e.file), s = readFileSync(f, 'utf8');
    if (s.split(e.from).length !== 2) throw new Error(`${t.name}: the edit's text must occur exactly once in ${e.file}`);
    writeFileSync(f, s.replace(e.from, e.to));
  }
  return tree;
}

function lint(t, tree) {
  const image = T.images[t.image] ?? die(`${t.name}: unknown image ${t.image}`);
  const rel = tree.slice(REPO.length);
  const r = spawnSync('docker', ['run', '--rm', '-v', `${REPO}:/xdrproof`, '-v', 'xdrproof-gocache-127:/cache',
    '-e', 'GOCACHE=/cache/build', '-e', 'GOMODCACHE=/cache/mod', '-e', 'GOFLAGS=-buildvcs=false', '-e', 'GOTOOLCHAIN=local', '-e', 'CGO_ENABLED=1',
    '-w', `/xdrproof${rel}`, image, '/xdrproof/linter/.work/bin/xplint', '-format', 'json', ...t.patterns], { maxBuffer: 2 ** 28 });
  if (r.status !== 0 && r.status !== 1) throw new Error(`${t.name}: xplint exited ${r.status}: ${r.stderr.toString().trim().split('\n').slice(-6).join(' | ')}`);
  return JSON.parse(r.stdout.toString());
}

// ---- run -----------------------------------------------------------------------------------------------
// a finding is its rule, place and message: the message names the source and the sink, so a different
// flow on the same line is a different finding
const key = (f) => `${f.rule} ${f.file}:${f.line} ${f.message}`;
const place = (f) => `${f.rule} ${f.file}:${f.line}`;
const results = {};
let bad = 0;
for (const t of T.targets) {
  if (opt.only && !t.name.includes(opt.only)) continue;
  const t0 = Date.now();
  let fs;
  try { fs = lint(t, prepare(t)); } catch (e) { die(e.message); }
  results[t.name] = fs;
  const want = (EXP.targets[t.name] ?? []).map(key).sort(), got = fs.map(key).sort();
  const missing = want.filter((k) => !got.includes(k)), extra = got.filter((k) => !want.includes(k));
  let mutantOK = true;
  if (t.kind === 'mutant') {
    // the mutant must add a finding of its rule that the unmutated tree does not have
    const base = EXP.targets[T.targets.find((b) => b.kind === 'codebase' && b.repo === t.repo && b.ref === t.ref).name] ?? [];
    const inScope = (f) => t.patterns.some((p) => f.file.startsWith(p.replace(/^\.\//, '').replace(/\.\.\.$/, '')));
    mutantOK = fs.filter((f) => f.rule === t.expect).length > base.filter((f) => f.rule === t.expect && inScope(f)).length;
  }
  const ok = missing.length === 0 && extra.length === 0 && mutantOK;
  if (!ok) bad++;
  const counts = {};
  for (const f of fs) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${t.name.padEnd(60)} ${String(fs.length).padStart(3)} findings  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${Object.entries(counts).map(([r, n]) => `${r} ${n}`).join(', ')}`);
  for (const k of missing) console.log(`       missing    ${k}`);
  for (const k of extra) console.log(`       unexpected ${k}`);
  if (t.kind === 'mutant' && !mutantOK) console.log(`       the mutant did not make ${t.expect} fire (${t.why})`);
}

if (opt.record) {
  const out = { about: EXP.about ?? 'Every finding of every target in targets.json, triaged. make lint must reproduce exactly these.', targets: {} };
  for (const t of T.targets) {
    const fs = results[t.name] ?? null;
    if (!fs) { out.targets[t.name] = EXP.targets[t.name] ?? []; continue; }
    const old = new Map((EXP.targets[t.name] ?? []).map((f) => [place(f), f]));
    out.targets[t.name] = fs.map((f) => ({ rule: f.rule, file: f.file, line: f.line, message: f.message, verdict: old.get(place(f))?.verdict ?? 'TODO', why: old.get(place(f))?.why ?? 'TODO', upstream: old.get(place(f))?.upstream ?? null }));
  }
  writeFileSync(EXP_FILE, JSON.stringify(out, null, 2) + '\n');
  const todo = Object.values(out.targets).flat().filter((f) => f.verdict === 'TODO').length;
  console.log(`\nrecorded linter/expectations.json${todo ? `: ${todo} finding(s) need triage (verdict TODO)` : ''}`);
  process.exit(0);
}

// ---- recorded.md ---------------------------------------------------------------------------------------
if (!opt.only && !opt.record) {
  const md = ['# xplint on real code', '', 'Generated by `make lint` (`node linter/lint.mjs`) from `targets.json`; every finding is pinned, with its triage, in',
    '`expectations.json`.', '', '| Target | Kind | Findings | By rule |', '|---|---|---|---|'];
  for (const t of T.targets) {
    const fs = results[t.name] ?? [];
    const c = {};
    for (const f of fs) c[f.rule] = (c[f.rule] ?? 0) + 1;
    md.push(`| ${t.name} | ${t.kind}${t.expect ? ` (must fire ${t.expect})` : ''} | ${fs.length} | ${Object.entries(c).map(([r, n]) => `${r} ${n}`).join(', ') || '—'} |`);
  }
  md.push('', '## Findings on the codebases, triaged', '');
  for (const t of T.targets.filter((x) => x.kind === 'codebase' || x.kind === 'patched')) {
    md.push(`### ${t.name}`, '', t.note ?? '', '');
    const fs = EXP.targets[t.name] ?? [];
    if (!fs.length) { md.push('No findings.', ''); continue; }
    md.push('| Rule | Where | Finding | Verdict | Why | Upstream |', '|---|---|---|---|---|---|');
    for (const f of fs) md.push(`| ${f.rule} | \`${f.file}:${f.line}\` | ${f.message.replaceAll('|', '\\|')} | ${f.verdict} | ${f.why} | ${f.upstream ? `[${f.upstream.replace(/^https:\/\/github.com\//, '').replace('/issues/', '#').replace('/pull/', '#')}](${f.upstream})` : '—'} |`);
    md.push('');
  }
  writeFileSync(join(HERE, 'recorded.md'), md.join('\n') + '\n');
}
if (bad) { console.log(`\nMISMATCH: ${bad} target(s) differ from linter/expectations.json`); process.exit(1); }
if (opt.only) console.log(`\npartial run (--only ${opt.only}): the targets run match; the others were not checked.`);
else if (!opt.record) console.log('\nOK: every target matches linter/expectations.json and every mutant fires its rule.');
