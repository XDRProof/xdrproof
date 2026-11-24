#!/usr/bin/env node
// upstream-table.mjs [--offline | --check] [--org <path to the org profile README>]
// The "Reported upstream" table, written once from findings/upstream.json into every place that shows it:
//   README.md           between <!-- upstream:start --> and <!-- upstream:end -->
//   findings/REPORT.md  the same table, its paths relative to findings/
//   --org <file>        the org profile's line of links (a separate repository; only when asked)
// The docs site reads findings/upstream.json and findings/upstream-status.json itself (docs/scripts/sync.mjs).
// Each report's status comes from GitHub: open or closed (and how), and whether anyone but us has commented since
// our issue or comment went up. It is saved in findings/upstream-status.json, so the copies change only when a
// status does, and the check needs no network.
//   (default)   ask GitHub, save the status, write the copies
//   --offline   write the copies from the saved status
//   --check     write nothing: fail when a copy differs from what the saved status gives (CI)
// GitHub is asked through the gh command when it is installed (signed in), otherwise through its public API
// (GITHUB_TOKEN is used when set).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { makeUI } from './ui.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'findings/upstream.json'), SNAP = join(ROOT, 'findings/upstream-status.json');
const argv = process.argv.slice(2), CHECK = argv.includes('--check'), OFFLINE = CHECK || argv.includes('--offline');
const ORG = argv.includes('--org') ? argv[argv.indexOf('--org') + 1] : null;
const ui = makeUI(), T0 = Date.now();
const fail = (msg, code = 2) => { ui.clear(); for (const l of ui.wrap(msg, ui.width - 4)) ui.out('  ' + ui.bad(l)); ui.verdict('fail', code === 1 ? 'FAILED' : 'ERROR', code === 1 ? 'A copy of the table is out of date' : 'The table could not be written', Date.now() - T0); process.exit(code); };
if (argv.includes('--org') && (!ORG || ORG.startsWith('--'))) fail('--org needs the path of the org profile README');

const src = JSON.parse(readFileSync(SRC, 'utf8'));
for (const r of src.reports) {
  if (!/^[\w.-]+\/[\w.-]+#\d+$/.test(r.ref)) fail(`findings/upstream.json: "${r.ref}" is not owner/repo#number`);
  for (const k of ['kind', 'url', 'what', 'found_by', 'figure', 'alt']) if (!r[k]) fail(`findings/upstream.json: ${r.ref} has no ${k}`);
  if (!['new', 'fix-offered', 'evidence'].includes(r.kind)) fail(`findings/upstream.json: ${r.ref}: unknown kind ${r.kind}`);
  if (!existsSync(join(ROOT, r.figure))) fail(`${r.ref}: the figure ${r.figure} is missing`);
}
ui.header(CHECK ? 'upstream-table --check' : 'upstream-table', [`${src.reports.length} reports · README, findings report${ORG ? ', org profile' : ''}`, `${src.reports.length} reports`, '']);

// ---- the status, from GitHub ------------------------------------------------------------------------------------
const hasGh = () => new Promise((res) => execFile('gh', ['--version'], (e) => res(!e)));
const api = async (path) => {
  if (useGh) return new Promise((res, rej) => execFile('gh', ['api', path], { maxBuffer: 32 << 20 }, (e, out, err) => (e ? rej(new Error(`gh api ${path}: ${(err || e.message).trim().split('\n').pop()}`)) : res(JSON.parse(out)))));
  const r = await fetch(`https://api.github.com/${path}`, { headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
  if (!r.ok) throw new Error(`GitHub ${path}: ${r.status} ${r.statusText}`);
  return r.json();
};
let useGh = false, snapChanged = false, snap = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : null;
if (!OFFLINE) {
  useGh = await hasGh();
  const row = ui.task('Asking GitHub').count(0, src.reports.length);
  const reports = {};
  let done = 0;
  try {
    await Promise.all(src.reports.map(async (r) => { // every report at once: a few seconds instead of one at a time
      const [, repo, n] = r.ref.match(/^(.+)#(\d+)$/);
      const issue = await api(`repos/${repo}/issues/${n}`);
      // when ours went up: our comment, or the issue when we opened it
      const ours = r.comment ? await api(`repos/${repo}/issues/comments/${r.comment}`) : null;
      if (r.comment && ours.user?.login !== src.author) throw new Error(`${r.ref}: comment ${r.comment} is not by ${src.author}`);
      if (r.comment && !String(ours.issue_url ?? '').endsWith(`/repos/${repo}/issues/${n}`)) throw new Error(`${r.ref}: comment ${r.comment} belongs to another issue`);
      if (!r.comment && issue.user?.login !== src.author) throw new Error(`${r.ref}: the issue is not by ${src.author}; name our comment in "comment"`);
      const posted = r.comment ? ours.created_at : issue.created_at;
      const comments = [];
      for (let page = 1; ; page++) {
        const c = await api(`repos/${repo}/issues/${n}/comments?per_page=100&page=${page}`);
        if (page > 50) { if (c.length) throw new Error(`${r.ref}: more than 5,000 comments; not counted`); break; } // page 51 only proves there are no more
        comments.push(...c); if (c.length < 100) break;
      }
      // a reply: a comment by a person (not us, not a bot) after ours; a maintainer: the repository's owner, a member
      // of its organisation or a collaborator, as GitHub marks them
      const replies = comments.filter((c) => c.user?.login !== src.author && c.user?.type !== 'Bot' && c.created_at > posted);
      const maint = replies.filter((c) => ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c.author_association));
      reports[r.ref] = { state: issue.state, reason: issue.state === 'closed' ? issue.state_reason ?? 'completed' : null, replies: replies.length, maintainer_replies: maint.length, last_reply: replies.at(-1)?.created_at?.slice(0, 10) ?? null, posted: posted.slice(0, 10) };
      row.count(++done, src.reports.length);
    }));
  } catch (e) { row.fail(); fail(`${e.message}. Nothing was written; --offline writes the copies from the saved status.`); }
  row.done();
  // the date changes only with a status: an unchanged run leaves every file as it was
  const ordered = Object.fromEntries(src.reports.map((r) => [r.ref, reports[r.ref]]));
  const same = snap && JSON.stringify(snap.reports) === JSON.stringify(ordered);
  snap = { checked: same ? snap.checked : new Date().toISOString().slice(0, 10), reports: ordered };
  snapChanged = !same;
}
if (!snap) fail('findings/upstream-status.json is missing: run node tools/upstream-table.mjs once with the network');
for (const r of src.reports) if (!snap.reports[r.ref]) fail(`findings/upstream-status.json has no status for ${r.ref}: run node tools/upstream-table.mjs`);

// ---- the copies -------------------------------------------------------------------------------------------------
const KIND = { new: 'new bug', 'fix-offered': 'fix offered', evidence: 'evidence added' };
const day = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (ref) => ref.split('/')[1];
const tags = (r) => {
  const s = snap.reports[r.ref], out = [];
  out.push(s.state === 'open' ? 'open' : s.reason === 'not_planned' ? 'not-planned' : 'closed');
  if (s.maintainer_replies) out.push('replied'); else if (s.replies) out.push('reply');
  if (r.fix) out.push('fix-ready');
  return out;
};
const TAG_ALT = { open: 'open', closed: 'closed', 'not-planned': 'closed, not planned', replied: 'maintainer replied', reply: 'reply received', 'fix-ready': 'fix ready' };
// base: the path from the copy's folder to the repository root ('' for README.md, '../' for findings/REPORT.md)
function table(base) {
  const rows = src.reports.map((r) => {
    const t = tags(r).map((k) => {
      const img = `<img src="${esc(base)}findings/badges/${k}.svg" alt="${esc(TAG_ALT[k])}">`;
      return k === 'fix-ready' ? `<a href="${esc(r.fix)}">${img}</a>` : img;
    }).join('<br>');
    return `  <tr>
    <td width="220"><a href="${esc(r.url)}"><img src="${esc(base + r.figure)}" width="220" alt="${esc(r.alt)}"></a></td>
    <td><a href="${esc(r.url)}"><b>${esc(short(r.ref))}</b></a> · ${KIND[r.kind]}<br>${esc(r.what)}</td>
    <td>${esc(r.found_by)}</td>
    <td>${t}</td>
  </tr>`;
  });
  const repro = src.reproduced.map((x) => `<a href="${esc(x.url)}">${esc(x.ref)}</a>`).join(', ');
  return [
    '<!-- upstream:start · written by tools/upstream-table.mjs from findings/upstream.json; do not edit -->',
    `Status checked on GitHub on ${day(snap.checked)}.`,
    '',
    '<table>',
    '  <tr><th>Figure</th><th>Report and what breaks</th><th>Found by</th><th>Status</th></tr>',
    ...rows,
    '</table>',
    '',
    `The replay also reproduces ${src.reproduced.length} fixed wallet-backend bugs at the commit before their fix, and each is gone once fixed: ${repro} (#716's fix exposed #729 on the same ledger, so that ledger passes after both).`,
    '<!-- upstream:end -->',
  ].join('\n');
}
function orgLine() {
  const link = (r) => `<a href="${esc(r.url)}">${esc(r.org_label ?? short(r.ref))}</a>`;
  const by = (k) => src.reports.filter((r) => r.kind === k);
  const lines = [['New bugs reported', by('new')], ['Fix offered', by('fix-offered')], ['Evidence added', by('evidence')]].filter(([, rs]) => rs.length)
    .map(([label, rs]) => `  <b>${label}:</b>\n  ${rs.map(link).join(' ·\n  ')}`);
  return ['<!-- upstream:start · written by tools/upstream-table.mjs in XDRProof/xdrproof; do not edit -->', '<p align="center">', lines.join('<br>\n'), '</p>', '<!-- upstream:end -->'].join('\n');
}
const START = '<!-- upstream:start', END = '<!-- upstream:end -->';
// exactly one start marker, then exactly one end marker after it: an orphan or a second block is an error, never a
// replacement that could swallow the text between them
const block = (text) => {
  const starts = text.split(START).length - 1, ends = text.split(END).length - 1, i = text.indexOf(START), j = text.indexOf(END);
  if (starts !== 1 || ends !== 1 || j < i) return null;
  return [i, j + END.length];
};
const targets = [['README.md', join(ROOT, 'README.md'), table('')], ['findings/REPORT.md', join(ROOT, 'findings/REPORT.md'), table('../')]];
if (ORG) targets.push(['org profile', ORG, orgLine()]);
const results = [];
for (const [name, file, out] of targets) {
  if (!existsSync(file)) fail(`${name}: ${file} does not exist`);
  const text = readFileSync(file, 'utf8'), at = block(text);
  if (!at) fail(`${name} needs exactly one <!-- upstream:start --> … <!-- upstream:end --> block to write into`);
  const next = text.slice(0, at[0]) + out + text.slice(at[1]);
  results.push({ name, file, next, changed: next !== text });
}
// everything is ready: now write, the copies first and the status last, so a failed write never leaves a new
// status saved beside old copies (the next --check would say so either way)
if (!CHECK) {
  for (const r of results) if (r.changed) writeFileSync(r.file, r.next);
  if (snapChanged) writeFileSync(SNAP, JSON.stringify(snap, null, 2) + '\n');
}

// ---- the result ------------------------------------------------------------------------------------------------
ui.clear();
const W = ui.width < 60;
ui.card({ title: W ? 'Reported upstream' : `Reported upstream · checked ${day(snap.checked)}`, score: `${src.reports.length}`, lines: src.reports.map((r) => {
  const t = tags(r).map((k) => TAG_ALT[k]).join(', ');
  return { mark: '✓', text: `${short(r.ref)} · ${KIND[r.kind]}`, right: W ? t.split(',')[0] : t, url: r.url };
}) });
ui.card({ title: CHECK ? 'Copies match the list' : 'Copies written', score: `${results.filter((r) => !(CHECK && r.changed)).length}/${results.length}`, lines: results.map((r) => ({
  mark: CHECK && r.changed ? '✗' : '✓', text: r.name, right: CHECK ? (r.changed ? 'out of date' : 'matches') : r.changed ? 'updated' : 'unchanged',
})) });
if (CHECK && results.some((r) => r.changed)) { ui.out('    ' + ui.dim('run: node tools/upstream-table.mjs --offline, then commit')); ui.verdict('fail', 'FAILED', 'A copy of the table is out of date', Date.now() - T0); process.exit(1); }
ui.verdict('gold', 'PASSED', CHECK ? 'Every copy matches findings/upstream.json.' : 'The table is written from one list.', Date.now() - T0);
