#!/usr/bin/env node
// lint.mjs: runs xplint on every target in linter/targets.json (codebases, a patched tree, the commits
// before and after upstream fixes, and mutants of wallet-backend main) and compares every finding with
// linter/expectations.json. Writes linter/recorded.md. Prints proof cards (tools/ui.mjs): each codebase with
// its findings and their upstream issues, the fixes caught before and gone after, our patches, the mutants.
//
//   node linter/lint.mjs [--only <substring>] [--record] [--fresh] [--jobs N] [--details]
//
// Each target's findings are cached in linter/.work/cache, keyed on the xplint binary, the toolchain image and
// the exact tree (repository, ref, patterns, patch contents, edits), so a run with nothing changed takes seconds;
// --fresh runs every target again. Targets run --jobs at a time (default 2: each type-check takes gigabytes).
//
// Exit 0 when every target matches its expectations and every mutant fires its rule; 1 otherwise; 2 when
// a target cannot be prepared or analysed.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { makeUI } from '../tools/ui.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..'), WORK = join(HERE, '.work');
const { values: opt } = parseArgs({ options: { only: { type: 'string' }, record: { type: 'boolean', default: false }, fresh: { type: 'boolean', default: false },
  jobs: { type: 'string', default: '2' }, details: { type: 'boolean', default: false }, v: { type: 'boolean', short: 'v', default: false } } });
const DETAILS = opt.details || opt.v;
const T = JSON.parse(readFileSync(join(HERE, 'targets.json'), 'utf8'));
const EXP_FILE = join(HERE, 'expectations.json');
const EXP = existsSync(EXP_FILE) ? JSON.parse(readFileSync(EXP_FILE, 'utf8')) : { targets: {} };
const BUGS = JSON.parse(readFileSync(join(HERE, 'bugs.json'), 'utf8'));
const ui = makeUI(), T0 = Date.now(), WIDTH = ui.width, narrow = WIDTH < 64;
const die = (m) => { ui.clear(); ui.verdict('fail', 'FAILED', 'xplint could not run', Date.now() - T0); ui.wrap(`lint: ${m}`, WIDTH - 4).forEach((l) => ui.out('  ' + ui.bad(l))); process.exit(2); };
const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 ** 28, ...o }).toString();
const shAsync = (cmd, args, o = {}) => new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 2 ** 28, ...o }, (e, out, err) => (e ? reject(Object.assign(e, { stderr: String(err) })) : resolve(String(out)))));
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80);
const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(typeof p === 'string' ? p : Buffer.from(p)); return h.digest('hex'); };
if (opt.only && !T.targets.some((t) => t.name.includes(opt.only))) die(`--only ${opt.only} matches no target in targets.json`);
const targets = T.targets.filter((t) => !opt.only || t.name.includes(opt.only));

// ---- what this run checks, said at once ----------------------------------------------------------------------
const GROUP = { codebase: 'codebases', history: 'fixes', patched: 'patches', mutant: 'mutants' };
const LABEL = { codebases: 'Codebases', fixes: 'Before and after fixes', patches: 'Our patches', mutants: 'Mutants of real code' };
const nOf = (k) => targets.filter((t) => GROUP[t.kind] === k).length;
const count = (n, w, ws = w + 's') => n && `${n} ${n === 1 ? w : ws}`;
ui.header('lint', [['xplint', count(nOf('codebases'), 'codebase'), nOf('fixes') && count(BUGS.fixes.length, 'upstream fix', 'upstream fixes'), count(nOf('mutants'), 'mutant')].filter(Boolean).join(' · '),
  [count(nOf('codebases'), 'codebase'), count(nOf('mutants'), 'mutant')].filter(Boolean).join(' · '), '']);
const rows = { build: ui.task('Building xplint', { since: T0 }) };
for (const k of Object.keys(LABEL)) if (nOf(k)) rows[k] = ui.task(LABEL[k], { waiting: true });

// ---- the linter binary, built in the pinned toolchain, only when its source changed -----------------------------
mkdirSync(join(WORK, 'bin'), { recursive: true });
const files = (d) => readdirSync(d).sort().flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const BUILD = ['go', 'build', '-o', '/xdrproof/linter/.work/bin/xplint', './cmd/xplint'];
const SOURCE = sha(JSON.stringify(BUILD), ...[...files(join(HERE, 'xplint')), ...files(join(HERE, 'cmd', 'xplint')), join(HERE, 'go.mod'), join(HERE, 'go.sum'), join(HERE, 'toolchain-image'), join(HERE, 'go.sh')]
  .flatMap((f) => [f.slice(HERE.length), readFileSync(f)]));
const BIN = join(WORK, 'bin', 'xplint'), STAMP = BIN + '.source';
if (!existsSync(BIN) || !existsSync(STAMP) || readFileSync(STAMP, 'utf8') !== SOURCE) {
  try { sh(join(HERE, 'go.sh'), BUILD); }
  catch (e) { die(`building xplint failed: ${String(e.stderr ?? e.message).trim().split('\n').slice(-4).join(' | ')}`); }
  writeFileSync(STAMP, SOURCE);
}
rows.build.done();
const XPLINT = sha(readFileSync(BIN));

// ---- one target ----------------------------------------------------------------------------------------
// the cache key: everything that decides xplint's findings on this target
// a target's patches, read once: the same bytes make its cache key and are applied to its tree
const patchesOf = (t) => [t.patch, ...(t.patches ?? [])].filter(Boolean).map((p) => readFileSync(join(HERE, p)));
const keyOf = (t, patches = patchesOf(t)) => sha(JSON.stringify({ xplint: XPLINT, image: T.images[t.image], repo: T.repos[t.repo], ref: t.ref, patterns: t.patterns,
  patches: patches.map((b) => sha(b)), edits: t.edits ?? [] }));
const CACHE = join(WORK, 'cache');
const cached = (t, k = keyOf(t)) => { try { const c = JSON.parse(readFileSync(join(CACHE, `${slug(t.name)}.json`), 'utf8')); return c.key === k ? c.findings : null; } catch { return null; } };

// one clone per repository, shared by its targets: fetched once, under a lock-free queue per repo
const repoReady = new Map();
function cloneOnce(repo) {
  if (!repoReady.has(repo)) repoReady.set(repo, (async () => {
    const src = join(WORK, 'src', repo);
    if (!existsSync(join(src, '.git'))) { mkdirSync(dirname(src), { recursive: true }); await shAsync('git', ['clone', '-q', '--filter=blob:none', T.repos[repo], src]); }
    return src;
  })());
  return repoReady.get(repo);
}
const fetched = new Map();
async function prepare(t, patches) {
  const src = await cloneOnce(t.repo);
  try { sh('git', ['-C', src, 'cat-file', '-e', `${t.ref}^{commit}`]); }
  catch { if (!fetched.has(t.repo)) fetched.set(t.repo, shAsync('git', ['-C', src, 'fetch', '-q', 'origin'])); await fetched.get(t.repo); }
  const tree = join(WORK, 'trees', slug(t.name));
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });
  await shAsync('sh', ['-c', `git -C "${src}" archive "${t.ref}" | tar -x -C "${tree}"`]);
  for (const b of patches) execFileSync('git', ['apply', '-p1', '-'], { cwd: tree, input: b, stdio: ['pipe', 'pipe', 'pipe'] });
  for (const e of t.edits ?? []) {
    const f = join(tree, e.file), s = readFileSync(f, 'utf8');
    if (s.split(e.from).length !== 2) throw new Error(`${t.name}: the edit's text must occur exactly once in ${e.file}`);
    writeFileSync(f, s.replace(e.from, e.to));
  }
  return tree;
}

// every xplint container is named, so a stop removes it even when its docker client is already gone
const running = new Map(); let seq = 0;
function lint(t, tree) {
  const image = T.images[t.image] ?? die(`${t.name}: unknown image ${t.image}`), name = `xdrproof-lint-${process.pid}-${seq++}`;
  const rel = tree.slice(REPO.length);
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['run', '--rm', '--name', name, '-v', `${REPO}:/xdrproof`, '-v', 'xdrproof-gocache-127:/cache',
      '-e', 'GOCACHE=/cache/build', '-e', 'GOMODCACHE=/cache/mod', '-e', 'GOFLAGS=-buildvcs=false', '-e', 'GOTOOLCHAIN=local', '-e', 'CGO_ENABLED=1',
      '-w', `/xdrproof${rel}`, image, '/xdrproof/linter/.work/bin/xplint', '-format', 'json', ...t.patterns], { stdio: ['ignore', 'pipe', 'pipe'] });
    running.set(name, p);
    let out = '', err = '';
    p.stdout.on('data', (c) => (out += c)); p.stderr.on('data', (c) => (err += c));
    p.on('close', (code) => {
      running.delete(name);
      if (code !== 0 && code !== 1) return reject(new Error(`${t.name}: xplint exited ${code}: ${err.trim().split('\n').slice(-6).join(' | ')}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error(`${t.name}: xplint printed no JSON`)); }
    });
  });
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => {
  ui.clear();
  for (const [name, p] of running) { p.kill(sig); spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); }
  process.exit(sig === 'SIGINT' ? 130 : 143);
});

// a missing image is pulled before the run, a few tries over (Docker Desktop and OrbStack sometimes fail to
// unpack a layer on the first pull)
const live = opt.fresh ? targets : targets.filter((t) => !cached(t));
for (const img of [...new Set(live.map((t) => T.images[t.image]))]) {
  if (spawnSync('docker', ['image', 'inspect', img], { stdio: 'ignore' }).status === 0) continue;
  const tag = Object.entries(T.images).find(([, v]) => v === img)?.[0] ?? img;
  let ok = false;
  for (let i = 1; i <= 3 && !ok; i++) {
    for (const k of Object.keys(LABEL)) rows[k]?.note(`downloading the ${tag} image${i > 1 ? ` (try ${i})` : ''}`);
    ok = await new Promise((r) => execFile('docker', ['pull', '-q', img], (e) => r(!e)));
  }
  if (!ok) die(`could not pull ${tag} (${img}); try: docker pull ${img}`);
}

// ---- run: --jobs targets at a time; each judged against its expectations ------------------------------------
// a finding is its rule, place and message: the message names the source and the sink, so a different
// flow on the same line is a different finding
const key = (f) => `${f.rule} ${f.file}:${f.line} ${f.message}`;
const results = {}, judged = {}, done = {};
for (const k of Object.keys(LABEL)) done[k] = 0;
async function runTarget(t) {
  const g = GROUP[t.kind], t0 = Date.now();
  // the patches are read once: their bytes make the key and are what prepare() applies
  const patches = patchesOf(t), k = keyOf(t, patches);
  let fs = opt.fresh ? null : cached(t, k), fromCache = !!fs;
  if (!fs) {
    if (!done[g]) rows[g].note(`type-checking ${t.name.replace(/^mutant: /, '')}`);
    fs = await lint(t, await prepare(t, patches));
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(join(CACHE, `${slug(t.name)}.json`), JSON.stringify({ key: k, findings: fs }));
  }
  results[t.name] = fs;
  const want = (EXP.targets[t.name] ?? []).map(key).sort(), got = fs.map(key).sort();
  const missing = want.filter((k) => !got.includes(k)), extra = got.filter((k) => !want.includes(k));
  let mutantOK = true;
  if (t.kind === 'mutant') {
    // the mutant must add a finding of its rule that the unmutated tree does not have
    const base = EXP.targets[T.targets.find((b) => b.kind === 'codebase' && b.repo === t.repo && b.ref === t.ref).name] ?? [];
    const inScope = (f) => t.patterns.some((p) => f.file.startsWith(p.replace(/^\.\//, '').replace(/\.\.\.$/, '')));
    // ... and one of them must be in a file the mutant edited, or trace its flow through one (a finding is
    // reported where the value is kept; its message names the source, as "blend/scval.go:110")
    const edited = (t.edits ?? []).map((e) => e.file);
    const touches = (f) => edited.some((e) => f.file === e || f.message.includes(e.split('/').slice(-2).join('/') + ':'));
    mutantOK = fs.filter((f) => f.rule === t.expect).length > base.filter((f) => f.rule === t.expect && inScope(f)).length
      && fs.some((f) => f.rule === t.expect && touches(f));
  }
  judged[t.name] = { ok: missing.length === 0 && extra.length === 0 && mutantOK, missing, extra, mutantOK, ms: Date.now() - t0, fromCache };
  rows[g].count(++done[g], nOf(g));
}
const errors = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Number(opt.jobs) || 2) }, async () => {
  while (next < targets.length) { const t = targets[next++]; try { await runTarget(t); } catch (e) { errors.push(e.message); judged[t.name] = { ok: false, error: e.message }; rows[GROUP[t.kind]].fail(); } }
}));
for (const k of Object.keys(LABEL)) if (rows[k] && done[k] === nOf(k)) rows[k].done();
ui.clear();

if (opt.record && errors.length) {
  ui.verdict('fail', 'FAILED', WIDTH >= 64 ? 'nothing recorded: xplint could not run' : 'nothing recorded', Date.now() - T0);
  for (const e of errors) ui.wrap(e, WIDTH - 6).forEach((l, i) => ui.out((i ? '      ' : '    ') + ui.bad(l)));
  process.exit(2);
}
if (opt.record) {
  const out = { about: EXP.about ?? 'Every finding of every target in targets.json, triaged. make lint must reproduce exactly these.', targets: {} };
  for (const t of T.targets) {
    const fs = results[t.name] ?? null;
    if (!fs) { out.targets[t.name] = EXP.targets[t.name] ?? []; continue; }
    // a triage carries over only to the same finding (rule, place and message); a changed message is a
    // different flow and is triaged again
    const old = new Map((EXP.targets[t.name] ?? []).map((f) => [key(f), f]));
    out.targets[t.name] = fs.map((f) => ({ rule: f.rule, file: f.file, line: f.line, message: f.message, verdict: old.get(key(f))?.verdict ?? 'TODO', why: old.get(key(f))?.why ?? 'TODO', upstream: old.get(key(f))?.upstream ?? null }));
  }
  writeFileSync(EXP_FILE, JSON.stringify(out, null, 2) + '\n');
  const todo = Object.values(out.targets).flat().filter((f) => f.verdict === 'TODO').length;
  ui.out(`  recorded linter/expectations.json${todo ? `: ${todo} finding(s) need triage (verdict TODO)` : ''}`);
  process.exit(todo ? 1 : 0);
}

// ---- recorded.md: only from a full run in which every target ran -----------------------------------------------
if (!opt.only && !errors.length) {
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

// ---- the cards ------------------------------------------------------------------------------------------------
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// the triage verdicts of linter/expectations.json, in a word or two
const VERDICT = { 'true positive': 'confirmed', 'true positive (hardening)': 'hardening', 'true positive, fixed upstream': 'fixed upstream', 'the mutant': 'the mutant' };
const rule0 = (r) => r.split('/')[0];
const linkLabel = (u) => (u?.match(/\/(?:issues|pull)\/(\d+)$/) ? `#${u.match(/(\d+)$/)[1]}` : u?.match(/\/commit\/([0-9a-f]{7})/)?.[1] ?? '');
// what went wrong with a target, as rows (each a ✗)
const wrongRows = (t) => {
  const j = judged[t.name];
  if (!j) return [];
  if (j.error) return [{ mark: '✗', text: narrow ? 'could not run' : 'xplint could not run on it', detail: j.error }];
  return [
    ...(j.extra.length ? [{ mark: '✗', text: plural(j.extra.length, 'new finding'), detail: j.extra }] : []),
    ...(j.missing.length ? [{ mark: '✗', text: `${plural(j.missing.length, 'recorded finding')} gone`, detail: j.missing }] : []),
    ...(t.kind === 'mutant' && !j.mutantOK ? [{ mark: '✗', text: `did not make ${t.expect} fire` }] : []),
  ];
};
// the reasons two targets of a pair differ from their record, as detail lines
const why = (...names) => names.flatMap((n) => wrongRows(targets.find((t) => t.name === n) ?? { name: n }).flatMap((w) => [`${n}: ${w.text}`, ...[].concat(w.detail ?? []).map((d) => `  ${d}`)]));
const cards = [];
for (const t of targets.filter((x) => x.kind === 'codebase')) {
  const [repo, ref] = t.name.split('@'), exp = EXP.targets[t.name] ?? [], groups = new Map();
  for (const f of exp) { const u = f.upstream ?? `rule:${f.rule}`, g = groups.get(u) ?? { url: f.upstream, n: 0, rules: new Set(), verdicts: new Set() }; g.n++; g.rules.add(f.rule); g.verdicts.add(f.verdict); groups.set(u, g); }
  const n = results[t.name]?.length ?? exp.length;
  cards.push({ title: narrow ? repo : `${repo} ${ref} · ${t.ref.slice(0, 8)}`, score: judged[t.name]?.error ? '–' : plural(n, 'finding'), lines: [
    ...wrongRows(t),
    ...[...groups.values()].sort((a, b) => b.n - a.n).map((g) => ({ mark: '!', text: BUGS.issues[g.url]?.title ?? [...g.rules].join(', '), right: linkLabel(g.url), url: g.url,
      detail: `${[...g.rules].join(', ')} · ${plural(g.n, 'finding')} · ${[...g.verdicts].map((v) => VERDICT[v] ?? v).join(', ')}` })),
    ...(!exp.length && !wrongRows(t).length ? [{ mark: '✓', text: 'no findings' }] : []),
  ] });
}
const fixRows = BUGS.fixes.filter((f) => judged[f.before] && judged[f.after]).map((f) => {
  const count = (name) => (EXP.targets[name] ?? []).filter((x) => x.upstream === f.upstream).length;
  const b = count(f.before), a = count(f.after), ok = judged[f.before].ok && judged[f.after].ok && b > 0 && a === 0;
  return { mark: ok ? '✓' : '✗', text: `${f.label} ${f.title}`, right: ok ? (narrow ? 'gone' : `${b} → ${a}`) : 'differs', url: f.upstream,
    detail: ok ? `${f.before.split('@')[1]}: ${plural(b, 'finding')} · ${f.after.split('@')[1]}: ${a}` : why(f.before, f.after) };
});
if (fixRows.length) cards.push({ title: narrow ? 'Before and after fixes' : 'Caught before the fix, gone after', score: `${fixRows.filter((r) => r.mark === '✓').length}/${fixRows.length}`, lines: fixRows });
const patchRows = BUGS.patches.filter((p) => judged[p.base] && judged[p.patched]).map((p) => {
  const b = (EXP.targets[p.base] ?? []).length, a = (EXP.targets[p.patched] ?? []).length, ok = judged[p.base].ok && judged[p.patched].ok && a < b;
  return { mark: ok ? '✓' : '✗', text: p.title, right: ok ? `${b} → ${a}` : 'differs', url: p.url, detail: ok ? `${p.patched.split('@')[1]}` : why(p.base, p.patched) };
});
if (patchRows.length) cards.push({ title: narrow ? 'Our patches' : 'Our patches for wallet-backend', score: `${patchRows.filter((r) => r.mark === '✓').length}/${patchRows.length}`, lines: patchRows });
const mutants = targets.filter((t) => t.kind === 'mutant');
if (mutants.length) {
  const mrows = mutants.map((t) => { const w = wrongRows(t); return w.length ? { ...w[0], text: `${t.name.replace(/^mutant: /, '')}: ${w[0].text}` } : { mark: '✓', text: t.name.replace(/^mutant: /, ''), right: rule0(t.expect), detail: t.why }; });
  cards.push({ title: narrow ? 'Mutants' : 'Mutants of wallet-backend main', score: `${mrows.filter((r) => r.mark === '✓').length}/${mrows.length}`, lines: mrows });
}
// a history or patched target outside the pairs above is still judged: shown when it differs
const paired = new Set([...BUGS.fixes.flatMap((f) => [f.before, f.after]), ...BUGS.patches.flatMap((p) => [p.base, p.patched])]);
const others = targets.filter((t) => (t.kind === 'history' || t.kind === 'patched') && !paired.has(t.name) && !judged[t.name]?.ok);
if (others.length) cards.push({ title: 'Other targets', score: `${others.length} differ`, lines: others.flatMap((t) => wrongRows(t).map((w) => ({ ...w, text: `${t.name}: ${w.text}` }))) });
cards.sort((a, b) => ui.rank(a.lines) - ui.rank(b.lines));
for (const c of cards) ui.card({ ...c, details: DETAILS });

const fromCache = Object.values(judged).filter((j) => j.fromCache).length;
if (DETAILS) {
  ui.out();
  for (const t of targets) {
    const j = judged[t.name]; if (!j) continue;
    ui.out('  ' + ui.dim(ui.trunc(`${t.name.replace(/^mutant: /, 'mutant ')} · ${j.error ? 'failed' : j.fromCache ? 'reused' : ui.elapsed(j.ms)}`, WIDTH - 4)));
  }
}
const bad = Object.values(judged).filter((j) => !j.ok).length;
if (errors.length || bad) {
  ui.section('problems');
  const problems = targets.flatMap((t) => wrongRows(t).flatMap((w) => [`${t.name}: ${w.text}`, ...[].concat(w.detail ?? []).slice(0, 3).map((d) => `  ${d}`)]));
  for (const p of problems.slice(0, DETAILS ? 60 : 12)) ui.wrap(p, WIDTH - 6).forEach((l, i) => ui.out((i ? '      ' : '    ') + ui.bad(l)));
  if (problems.length > (DETAILS ? 60 : 12)) ui.out('    ' + ui.dim(`… and ${problems.length - (DETAILS ? 60 : 12)} more: make lint DETAILS=1`));
  ui.verdict('fail', 'FAILED', errors.length ? (WIDTH >= 64 ? `xplint could not run on ${plural(errors.length, 'target')}` : `${errors.length} not run`)
    : (WIDTH >= 64 ? `${plural(bad, 'target')} differ${bad === 1 ? 's' : ''} from the record` : `${bad} differ${bad === 1 ? 's' : ''}`), Date.now() - T0);
  process.exit(errors.length ? 2 : 1);
}
ui.verdict('gold', 'PASSED', WIDTH >= 64 ? 'Every finding as recorded, every mutant caught.' : 'As recorded.', Date.now() - T0);
if (opt.only) ui.out('  ' + ui.dim(`partial run (--only ${opt.only}): the others were not checked`));
if (fromCache && !DETAILS) ui.out('  ' + ui.dim(fromCache === targets.length ? (WIDTH >= 72 ? 'results reused from the last run · ARGS=--fresh runs them again' : 'reused (--fresh reruns)') : `${fromCache} of ${targets.length} reused from the last run`));
if (!DETAILS) ui.out(`  ${ui.dim(narrow ? 'more:' : 'rules, verdicts and timings:')}  make lint DETAILS=1`);
