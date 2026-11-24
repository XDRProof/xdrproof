#!/usr/bin/env node
// The end of `make replay`: proof cards (tools/ui.mjs) from the reports the harness wrote under replay/runs/.
//   wallet-backend main   how many corpus ledgers it handled, and the known issue behind each one it did not
//   caught before the fix every upstream fix in replay/sightings.json: the verdict before it and after it
// Cards with a problem come first. Exit 1 when a verdict differs from replay/expectations/, 2 on a harness error.
// usage: node replay/summary.mjs [adapter] [--details]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeUI } from '../tools/ui.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTER = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'wallet-backend';
const DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
const ui = makeUI();
const json = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
// run.sh sets XDRPROOF_START (when the run began) and XDRPROOF_PARTS (main, sightings or all): a report older than
// the run means that harness run did not finish, and is never shown as a result.
const START = Number(process.env.XDRPROOF_START || 0), PARTS = process.env.XDRPROOF_PARTS || 'all';
let harnessError = false;
const report = (target) => {
  const r = json(join(HERE, 'runs', `${ADAPTER}@${target}`, 'report.json'));
  if (r && START && Date.parse(r.at) < START) return { stale: true, target };
  if (r?.errors?.length) harnessError = true;
  return r;
};
// why a harness run stopped: the last fatal line of its log (the harness writes "replay: <reason>" before exiting)
const whyStopped = (t) => {
  const log = join(HERE, '.work', 'logs', `${t}.log`);
  const last = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l.startsWith('replay: ')).pop() : null;
  return last ? last.slice(8).split(' | ')[0].replace(/\s+/g, ' ') : 'did not finish';
};
const BUGS = json(join(HERE, 'bugs.json')) ?? { issues: {}, sightings: {} };
const issueNo = (url) => (url?.match(/\/(issues|pull)\/(\d+)$/)?.[2] ? `#${url.match(/\/(issues|pull)\/(\d+)$/)[2]}` : '');
const WIDTH = ui.width, C = Math.min(WIDTH - 4, 64), INNER = C - 4, narrow = WIDTH < 64;
const problems = [], cards = [];
// wrapped, not cut, on a narrow terminal: the reason (or the detail) is the part that matters
const wrap = (t, w) => t.split(' ').reduce((ls, word) => { const l = ls[ls.length - 1]; if (l && (l + ' ' + word).length <= w) ls[ls.length - 1] = l + ' ' + word; else ls.push(word.length > w ? ui.trunc(word, w) : word); return ls; }, []);
// a verdict can match while the facts that failed differ: say so instead of "expected mishandled, got mishandled"
const differs = (m) => (m.want === m.got ? `${m.got}, but not the facts expected to fail` : `expected ${m.want}, got ${m.got}`);

// ---- the corpus against main ----------------------------------------------------------------------------------
const mainExp = json(join(HERE, 'expectations', `${ADAPTER}@main.json`));
let main = PARTS === 'sightings' ? null : report('main');
if (main?.stale || (START && PARTS !== 'sightings' && !main)) {
  problems.push(`main: ${whyStopped('main')}; log: replay/.work/logs/main.log`); harnessError = true; main = null;
  cards.push({ title: narrow ? 'wallet-backend' : 'wallet-backend main', score: '–', ok: false, lines: [{ mark: '✗', text: 'the run did not finish', right: narrow ? '' : 'see problems' }] });
}
if (main) {
  const judged = Object.values(main.counts).reduce((n, v) => n + v, 0) - (main.counts.unsupported ?? 0);
  const handled = main.counts.handled ?? 0;
  // each variant that was not handled, grouped under the first upstream issue its expectation names
  const groups = new Map();
  for (const s of main.sessions) for (const vid of s.variants) {
    if (['handled', 'unsupported'].includes(s.verdict)) continue;
    const want = mainExp?.verdicts?.[vid], url = want?.upstream?.[0] ?? null, key = url ?? `new:${s.verdict}`;
    const g = groups.get(key) ?? { url, verdict: s.verdict, n: 0, others: want?.upstream?.slice(1) ?? [] }; g.n++; groups.set(key, g);
  }
  for (const m of main.mismatches ?? []) problems.push(`main ${m.vid}: ${differs(m)}`);
  for (const e of main.errors ?? []) problems.push(`main: session ${e} failed in the harness or adapter`);
  cards.push({
    title: narrow ? 'wallet-backend' : `wallet-backend main · ${main.ref.slice(0, 8)}`, score: `${handled}/${judged}`, ok: handled === judged,
    lines: [
      ...((main.mismatches?.length || main.errors?.length) ? [{ mark: '✗', text: `${(main.mismatches?.length ?? 0) + (main.errors?.length ?? 0)} result(s) differ from the expectations` }] : []),
      ...[...groups.values()].sort((a, b) => b.n - a.n).map((g) => ({
        mark: g.url ? '!' : '✗', text: g.url ? BUGS.issues[g.url]?.title ?? g.verdict : `${g.n} ${g.verdict}, no known cause`,
        right: issueNo(g.url), url: g.url, detail: `${g.verdict} · ${g.n} ledger${g.n === 1 ? '' : 's'}${g.others.length ? ` · also ${g.others.map(issueNo).join(', ')}` : ''}`,
      })),
    ],
    footer: main.partial ? `partial run: ${judged} of ${mainExp?.judged?.count ?? '?'} ledgers` : null,
  });
}

// ---- the upstream fixes, before and after ----------------------------------------------------------------------
const sightings = PARTS === 'main' ? [] : json(join(HERE, 'sightings.json'))?.sightings ?? [];
const byIssue = new Map();
for (const s of sightings) { const list = byIssue.get(s.issue) ?? []; list.push(s); byIssue.set(s.issue, list); }
// every commit's problems are reported once (two sightings can share a commit); a row fails on its own variants,
// or when its commit's run did not finish or had a harness error
const rows = [], seen = new Map(), stopped = new Map(); // reason -> the commits whose runs stopped for it
const commitState = (c) => {
  if (seen.has(c)) return seen.get(c);
  const r = report(c), st = { ran: !!r || !!START, have: !!r && !r.stale, broken: false, mismatches: [], replayed: new Set() };
  if (!r || r.stale) { if (START) { st.broken = true; harnessError = true; const w = whyStopped(c); stopped.set(w, [...(stopped.get(w) ?? []), c]); } }
  else {
    st.mismatches = r.mismatches ?? [];
    // which variants this commit's run really replayed (a filtered run, --entries or --variants, may skip some)
    st.replayed = new Set([...(r.sessions ?? []).flatMap((x) => x.variants), ...Object.keys(r.unsupported ?? {})]);
    for (const m of st.mismatches) problems.push(`${c} ${m.vid}: ${differs(m)}`);
    if (r.errors?.length) { st.broken = true; for (const e of r.errors) problems.push(`${c}: session ${e} failed in the harness or adapter`); }
  }
  seen.set(c, st); return st;
};
for (const [issue, list] of byIssue) {
  let ok = true, any = false, all = true, broken = false, unproven = false, before = null, after = null;
  for (const s of list) {
    const commits = Object.keys(s.verdicts);
    for (const c of commits) {
      const st = commitState(c);
      any ||= st.ran; all &&= st.have;
      // a fix is proven only when every one of its ledgers was replayed at every commit, before and after
      const missing = st.have ? s.variants.filter((v) => !st.replayed.has(v)) : [];
      if (missing.length) { ok = false; unproven = true; problems.push(`${c}: ${missing.length} of ${s.variants.length} ledger${s.variants.length === 1 ? '' : 's'} of ${issueNo(issue)} not replayed (a filtered run)`); }
      broken ||= st.broken;
      if (st.broken || st.mismatches.some((m) => s.variants.includes(m.vid) || m.vid.startsWith('('))) ok = false;
    }
    // the verdict at the last commit before the fix, and at the fix (the expected words from sightings.json)
    before ??= s.verdicts[commits[commits.length - 2]]?.split(':')[0];
    after ??= s.verdicts[commits[commits.length - 1]]?.split(':')[0];
  }
  rows.push({ mark: ok ? '✓' : '✗', text: `${issueNo(issue)} ${BUGS.sightings[issue]?.title ?? list[0].what}`, right: ok ? (narrow ? 'fixed' : `${before} → ${after}`) : broken ? (narrow ? 'stopped' : 'did not finish') : unproven ? (narrow ? 'partial' : 'not replayed') : 'differs', url: issue, ran: START ? any : all }); // on its own: shown only when every commit of the fix has a report
}
// a mismatch at a commit on a variant no sighting names still fails the run (it is in problems) but marks no row
// the same reason at many commits (a database that never came up) is one line, not ten
for (const [w, cs] of stopped) problems.push(cs.length > 1 ? `${cs.length} commits (${cs[0]}, …): ${w}; logs: replay/.work/logs/` : `${cs[0]}: ${w}; log: replay/.work/logs/${cs[0]}.log`);
// run on its own (no run.sh), a sighting with no report yet is left out rather than shown as passing
const shown = rows.filter((r) => r.ran);
if (shown.length) {
  const good = shown.filter((r) => r.mark === '✓').length;
  cards.push({ title: narrow ? 'Before and after fixes' : 'Caught before the fix, gone after', score: `${good}/${shown.length}`, ok: good === shown.length, lines: shown });
}

// ---- the cards: a failure first, then known problems, then the clean ones ------------------------------------
const rank = (c) => (c.lines.some((l) => l.mark === '✗') ? 0 : c.lines.some((l) => l.mark === '!') ? 1 : 2);
cards.sort((a, b) => rank(a) - rank(b));
const total = main ? Object.values(main.counts).reduce((n, v) => n + v, 0) : 0;
// replay/run.mjs prints the header when the run starts
if (!process.env.XDRPROOF_HEADER_DONE) ui.header('replay', [
  [ADAPTER, total && `${total} ledger${total === 1 ? '' : 's'}`, shown.length && `${shown.length} upstream fix${shown.length === 1 ? '' : 'es'}`].filter(Boolean).join(' · '),
  [total && `${total} ledgers`, shown.length && `${shown.length} fixes`].filter(Boolean).join(' · '), '']);
if (!cards.length) { ui.out('  ' + ui.dim('No replay reports yet: run make replay.')); process.exit(2); }
for (const c of cards) {
  const sc = c.ok ? c.score : rank(c) === 0 ? ui.bad(c.score) : ui.known(c.score);
  ui.out(`  ${ui.dim('╭─ ')}${ui.bold(c.title)}${ui.dim(' ' + '─'.repeat(Math.max(1, C - 7 - c.title.length - c.score.length)) + ' ')}${sc}${ui.dim('─╮')}`);
  for (const l of c.lines) {
    const mark = l.mark === '✓' ? ui.pass('✓') : l.mark === '!' ? ui.known('!') : ui.bad('✗');
    const rw = l.right ? l.right.length : 0, room = INNER - 2 - (rw ? rw + 1 : 0), text = ui.trunc(l.text, room);
    const right = rw ? ' ' + (l.mark === '!' ? ui.known(ui.link(l.right, l.url)) : ui.dim(l.right)) : '';
    ui.out(`  ${ui.dim('│')} ${mark} ${text}${' '.repeat(Math.max(0, room - text.length))}${right} ${ui.dim('│')}`);
    if (DETAILS && l.detail) { const d = ui.trunc(l.detail, INNER - 2); ui.out(`  ${ui.dim('│')}   ${ui.dim(d.padEnd(INNER - 2))} ${ui.dim('│')}`); }
  }
  if (c.footer) ui.out(`  ${ui.dim('│')} ${ui.dim(ui.trunc(c.footer, INNER).padEnd(INNER))} ${ui.dim('│')}`);
  ui.out(`  ${ui.dim('╰' + '─'.repeat(C - 2) + '╯')}`);
}
if (DETAILS && main) {
  const ms = main.sessions.flatMap((s) => (s.attempts ?? []).map((a) => a.ms)).filter(Boolean), mem = Math.max(0, ...main.sessions.map((s) => s.memory_peak_bytes ?? 0));
  ui.out();
  for (const t of [`${main.sessions.length} sessions on main · ${(ms.reduce((a, b) => a + b, 0) / ms.length / 1000).toFixed(1)} s average, ${(Math.max(...ms) / 1000).toFixed(1)} s at most`,
    `indexer memory up to ${(mem / 2 ** 20).toFixed(0)} MiB · harness ${(main.harness_peak_rss_bytes / 2 ** 20).toFixed(0)} MiB`,
    'full logs: replay/.work/logs/ · per session: replay/runs/']) wrap(t, WIDTH - 4).forEach((l, i) => ui.out((i ? '    ' : '  ') + ui.dim(l)));
}
if (problems.length) {
  ui.section('problems');
  for (const p of problems.slice(0, DETAILS ? 40 : 10)) wrap(p, WIDTH - 6).forEach((l, i) => ui.out((i ? '      ' : '    ') + ui.bad(l)));
  if (problems.length > (DETAILS ? 40 : 10)) ui.out('    ' + ui.dim(`… and ${problems.length - (DETAILS ? 40 : 10)} more in replay/.work/logs/`));
  ui.verdict('fail', 'FAILED', `${problems.length} problem${problems.length === 1 ? '' : 's'}: see above`, START ? Date.now() - START : undefined);
  process.exit(harnessError ? 2 : 1);
}
ui.verdict('gold', 'PASSED', WIDTH >= 60 ? 'Every verdict matches its expectation.' : 'Verdicts as expected.', START ? Date.now() - START : undefined);
if (!DETAILS) ui.out(`  ${ui.dim(narrow ? 'more:' : 'issue details, timings and logs:')}  make replay DETAILS=1`);
