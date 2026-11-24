#!/usr/bin/env node
// xdrproof oracle: are the corpus's expected facts confirmed by readers that share no code with the
// decoders under test?
//   walker : XDRProof's schema walker (xdr.json only, no SDK)
//   core   : stellar-core's own decoder (dump-xdr)
// For each fact, its expected primitive values must appear in each reader's output for that ledger.
// Values that are enum names (e.g. "success", "persistent") are checked by enum member (see ENUMS below).
// A checkable value missing from a reader is a DISAGREEMENT: either the fact or a reader is wrong.
//
// usage: node tools/oracle.mjs [--write] [--details]   (--write adds/removes the "core" and "walker" evidence labels)
//
// stellar-core prints every ledger in one container, several at a time, while worker threads walk the same ledgers
// with the schema walker; each worker then reads stellar-core's printouts of its own ledgers and checks the facts.
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadDefs, Walker } from './walker.mjs';
import { coreDump, valuesFromDump } from './core-facts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bytesOf = (f) => (f.endsWith('.zst') ? zstdDecompressSync(readFileSync(f)) : readFileSync(f));
// Enum-valued facts are checked too. tools/coverage/defs/sep0051-enum-names.json maps every XDR enum member to the
// string SEP-0051 prints for it (taken from stellar-xdr's own JSON schema). An expected value that is such a string
// is confirmed by the walker when it reached that member in this ledger, and by stellar-core when its dump printed
// the member's XDR name. A union arm name in the SEP-0051 path (e.g. tx_failed) is not a value and is not checked.
const ENUMS = JSON.parse(readFileSync(join(ROOT, 'tools/coverage/defs/sep0051-enum-names.json'), 'utf8')).enums;
const MEMBERS_OF = new Map(); // SEP-0051 string -> [[Enum, member], ...]
for (const [e, m] of Object.entries(ENUMS)) for (const [member, str] of Object.entries(m)) MEMBERS_OF.set(str, [...(MEMBERS_OF.get(str) ?? []), [e, member]]);
const walkerHas = (w, hits, x) => w.has(x) || (MEMBERS_OF.get(x) ?? []).some(([e, m]) => hits.has(`E:${e}.${m}`));
const coreHas = (c, x) => c.has(x) || (MEMBERS_OF.get(x) ?? []).some(([, m]) => c.has(m));
// Self-test: every expected value of 10+ digits (64-bit amounts, IDs, fees) is changed in its last digit and both
// readers are asked again. A reader that confirms a changed value is not reading what it claims to. The oracle checks
// that a value occurs in the ledger (the exact path is verify.mjs's job), so a changed value that happens to occur
// elsewhere in the same ledger is counted as a coincidence, not a failure; one reader alone accepting it is a failure.
const changed = (x) => x.slice(0, -1) + ((Number(x.at(-1)) + 1) % 10);

// ---- a worker: walk its ledgers, wait for stellar-core's printouts, check every fact -------------------------
if (!isMainThread && workerData?.oracleJobs) {
  const defs = loadDefs(join(ROOT, 'tools/coverage/defs/xdr-v30.0.json'));
  // after the walk only what the core side still needs is kept: the walker's verdicts, and for each planted value
  // whether the walker saw it (holding every walked value set until the printouts are ready would cost memory)
  const held = [];
  for (const j of workerData.oracleJobs) {
    const walker = new Walker(defs); const w = walker.run(bytesOf(j.file), j.type); const hits = walker.hits; // fresh per ledger
    held.push({ j, facts: j.facts.map((f) => ({ k: f.k, says: f.says, checkable: f.checkable,
      wMissing: f.checkable.filter((x) => !walkerHas(w, hits, x)),
      planted: f.checkable.filter((v) => /^-?[0-9]{10,}$/.test(v)).map((x) => ({ x, wSees: walkerHas(w, hits, changed(x)) })) })) });
    parentPort.postMessage({ walked: j.i });
  }
  parentPort.once('message', ({ dumps }) => {
    for (const { j, facts } of held) {
      let c = null;
      if (!dumps.failed.includes(j.i)) try { c = valuesFromDump(dumps.files[j.i]); } catch { c = null; }
      const out = [], lines = [], planted = { tried: 0, caughtByBoth: 0, coincidence: 0, oneReader: 0 };
      for (const f of facts) {
        const cMissing = c ? f.checkable.filter((x) => !coreHas(c, x)) : null;
        out.push({ k: f.k, checkable: f.checkable.length, walker: f.checkable.length > 0 && f.wMissing.length === 0, core: c !== null && f.checkable.length > 0 && cMissing.length === 0 });
        for (const { x, wSees } of c ? f.planted : []) {
          const cSees = coreHas(c, changed(x));
          planted.tried++;
          if (!wSees && !cSees) planted.caughtByBoth++;
          else if (wSees && cSees) planted.coincidence++;
          else { planted.oneReader++; lines.push({ who: 'planted', text: `${j.id}@${j.key} fact ${f.k}: ${changed(x)} (from ${x}) seen by ${wSees ? 'the walker' : 'stellar-core'} only` }); }
        }
        if (c === null && f.checkable.length) lines.push({ who: 'unprintable', text: `${j.id}@${j.key} fact ${f.k}: stellar-core could not print this ledger, so nothing is confirmed` });
        if (f.wMissing.length) lines.push({ who: 'walker', text: `${j.id}@${j.key} fact ${f.k} "${f.says.slice(0, 60)}": missing ${f.wMissing.join(', ')}` });
        if (cMissing?.length) lines.push({ who: 'core', text: `${j.id}@${j.key} fact ${f.k} "${f.says.slice(0, 60)}": missing ${cMissing.join(', ')}` });
      }
      parentPort.postMessage({ checked: j.i, facts: out, lines, planted, coreFailed: c === null && facts.some((f) => f.checkable.length) });
    }
  });
} else await main();

async function main() {
  const { makeUI } = await import('./ui.mjs');
  const WRITE = process.argv.includes('--write'), DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
  const ui = makeUI(), T0 = Date.now();

  function leaves(v, out = []) {
    if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out));
    else if (v !== null && v !== undefined) out.push(String(v));
    return out;
  }
  const expectedValues = (fact) => ('equals' in fact ? leaves(fact.equals) : 'some' in fact ? leaves(Object.values(fact.some)) : []);

  const ids = readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort();
  const entries = new Map(ids.map((id) => [id, JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'))]));
  const jobs = [];
  for (const [id, entry] of entries) for (const v of entry.variants) {
    const file = join(ROOT, 'entries', id, v.file);
    // v<n> is the SEP-0051 name of a void arm of an int-discriminated union (e.g. ext "v0"): structure, not a value
    const facts = entry.expected.facts.map((f, k) => ({ f, k })).filter(({ f }) => !f.variants || f.variants.includes(v.key))
      .map(({ f, k }) => ({ k, says: f.says, checkable: expectedValues(f).filter((x) => !/^v[0-9]+$/.test(x)) }));
    jobs.push({ i: jobs.length, id, key: v.key, file, type: entry.xdr_type, size: statSync(file).size, facts });
  }
  const nFacts = [...entries.values()].reduce((n, e) => n + e.expected.facts.length, 0);
  ui.header(WRITE ? 'oracle --write' : 'oracle', [`${ui.num(ids.length)} entries · ${ui.num(jobs.length)} ledgers · ${ui.num(nFacts)} facts`, `${ui.num(ids.length)} entries · ${ui.num(nFacts)} facts`, '']);
  const rowCore = ui.task("stellar-core's decoder", { since: T0 }).note('writing the ledgers');
  const rowWalk = ui.task('Schema walker', { since: T0 });
  const rowCheck = ui.task('Checking every fact', { waiting: true });

  // the walk starts at once, in workers; stellar-core runs beside it
  const n = Math.max(1, Math.min(availableParallelism() - 2, 6, Math.ceil(jobs.length / 16)));
  const shares = Array.from({ length: n }, () => []);
  [...jobs].sort((a, b) => b.size - a.size).forEach((j, k) => shares[k % n].push(j));
  const results = new Array(jobs.length); let walked = 0, checked = 0, failure = null;
  const workers = shares.map((share) => new Worker(new URL(import.meta.url), { workerData: { oracleJobs: share } }));
  const allChecked = new Promise((resolve, reject) => {
    let left = workers.length;
    for (const w of workers) {
      w.on('message', (m) => {
        if ('walked' in m) { rowWalk.count(++walked, jobs.length); if (walked === jobs.length) rowWalk.done(); }
        else { results[m.checked] = m; rowCheck.count(++checked, jobs.length); }
      });
      w.on('error', reject);
      w.on('exit', (code) => { if (code !== 0) reject(new Error(`an oracle worker exited ${code}`)); else if (--left === 0) resolve(); });
    }
  });
  const stopAll = (e) => { failure ??= e; for (const w of workers) w.terminate(); };
  allChecked.catch(stopAll);
  let dumps = null;
  try {
    // a worker that fails during the walk ends the run at once, not after stellar-core finishes
    const workerFailed = new Promise((_, reject) => allChecked.catch(reject));
    dumps = await Promise.race([coreDump(jobs.map((j) => bytesOf(j.file)), { onStatus: (t) => rowCore.note(t), onProgress: (d, t) => rowCore.count(d, t) }), workerFailed]);
    rowCore.done();
    const files = jobs.map((j) => dumps.file(j.i)), failed = jobs.filter((j) => dumps.failed(j.i)).map((j) => j.i);
    rowCheck.start();
    for (const w of workers) w.postMessage({ dumps: { files, failed } });
    await allChecked;
    rowCheck.done();
  } catch (e) {
    stopAll(e); dumps?.cleanup(); rowCore.fail(); ui.clear();
    for (const l of ui.wrap(String(e.message ?? e), ui.width - 4)) ui.out('  ' + ui.bad(l));
    ui.verdict('fail', 'ERROR', 'The oracle could not run', Date.now() - T0);
    process.exit(2);
  }
  dumps.cleanup();

  // ---- per entry, per fact: confirmed only when every variant it applies to confirms it ----------------------
  const verdicts = new Map(); // id -> fact index -> {core:[bool per variant], walker:[...], checkable}
  const planted = { tried: 0, caughtByBoth: 0, coincidence: 0, oneReader: 0 }, problems = { core: [], walker: [], planted: [], unprintable: [] };
  let unprintable = 0;
  for (const j of jobs) {
    const r = results[j.i];
    const per = verdicts.get(j.id) ?? new Map(); verdicts.set(j.id, per);
    for (const f of r.facts) {
      const rec = per.get(f.k) ?? { core: [], walker: [], checkable: f.checkable }; per.set(f.k, rec);
      rec.core.push(f.core); rec.walker.push(f.walker);
    }
    for (const k of Object.keys(planted)) planted[k] += r.planted[k];
    for (const l of r.lines) problems[l.who].push(l.text);
    if (r.coreFailed) unprintable++;
  }
  let nCore = 0, nWalker = 0, nNot = 0;
  const table = [];
  for (const id of ids) {
    const entry = entries.get(id), per = verdicts.get(id) ?? new Map();
    let c = 0, w = 0, not = 0;
    entry.expected.facts.forEach((f, k) => {
      const r = per.get(k);
      const coreOk = r && r.core.length && r.core.every(Boolean);
      const walkerOk = r && r.walker.length && r.walker.every(Boolean);
      if (!r || r.checkable === 0) not++;
      if (coreOk) c++;
      if (walkerOk) w++;
      if (WRITE) {
        const keep = f.evidence.filter((e) => e !== 'core' && e !== 'walker');
        f.evidence = [...keep, ...(coreOk ? ['core'] : []), ...(walkerOk ? ['walker'] : [])];
      }
    });
    if (WRITE) writeFileSync(join(ROOT, 'entries', id, 'entry.json'), JSON.stringify(entry, null, 2) + '\n');
    nCore += c; nWalker += w; nNot += not;
    table.push([id, entry.expected.facts.length, c, w, not]);
  }

  // ---- the cards: a failure first ---------------------------------------------------------------------------
  ui.clear();
  const narrow = ui.width < 60, checkable = nFacts - nNot;
  const coreBad = problems.core.length, walkerBad = problems.walker.length;
  const cards = [
    { title: narrow ? 'stellar-core' : "stellar-core's own decoder", score: `${ui.num(nCore)}/${ui.num(checkable)}`, lines: [
      ...(unprintable ? [{ mark: '✗', text: `${unprintable} ledger${unprintable === 1 ? '' : 's'} it could not print` }] : []),
      ...(coreBad ? [{ mark: '✗', text: `${coreBad} fact value${coreBad === 1 ? '' : 's'} not in its printout` }] : []),
      ...(!coreBad && !unprintable ? [{ mark: '✓', text: narrow ? 'every fact found' : 'found every fact in its printout' }] : []),
    ] },
    { title: 'Schema walker', score: `${ui.num(nWalker)}/${ui.num(checkable)}`, lines: [
      walkerBad ? { mark: '✗', text: `${walkerBad} fact value${walkerBad === 1 ? '' : 's'} not found` } : { mark: '✓', text: narrow ? 'every fact found' : 'found every fact in the ledger' },
    ] },
    { title: narrow ? 'Planted errors' : 'Planted errors (one digit changed)', score: `${ui.num(planted.tried - planted.oneReader)}/${ui.num(planted.tried)}`, lines: [
      ...(planted.oneReader ? [{ mark: '✗', text: `${planted.oneReader} accepted by one reader only` }] : []),
      ...(planted.caughtByBoth ? [{ mark: '✓', text: narrow ? `${ui.num(planted.caughtByBoth)} rejected by both` : `${ui.num(planted.caughtByBoth)} rejected by both readers` }] : [{ mark: '✗', text: 'none was rejected: the self-test failed' }]),
      ...(planted.coincidence ? [{ mark: '✓', text: narrow ? `${planted.coincidence} exist elsewhere` : `${planted.coincidence} happen to exist elsewhere in the ledger` }] : []),
    ] },
  ];
  cards.sort((a, b) => ui.rank(a.lines) - ui.rank(b.lines));
  for (const c of cards) ui.card(c);
  ui.out();
  for (const l of ui.wrap(`${ui.num(nNot)} facts have no value to check (a length or a structure); make verify checks those at their exact place.`, ui.width - 4)) ui.out('  ' + ui.dim(l));

  if (DETAILS) {
    const pad = (s, k) => String(s).padEnd(k);
    ui.out();
    if (ui.width < 80) { // narrow: the entry on one line, its counts under it
      for (const [id, f, c, w, not] of table) { ui.out('  ' + ui.trunc(id, ui.width - 4)); for (const l of ui.wrap(`${f} facts · core ${c} · walker ${w} · no value ${not}`, ui.width - 6)) ui.out('    ' + ui.dim(l)); }
    } else {
      const W = Math.min(56, ui.width - 30);
      ui.out('  ' + ui.dim(`${pad('entry', W)} ${pad('facts', 6)}${pad('core', 6)}${pad('walker', 7)}no value`));
      for (const [id, f, c, w, not] of table) ui.out(`  ${pad(ui.trunc(id, W), W)} ${pad(f, 6)}${pad(c, 6)}${pad(w, 7)}${not}`);
    }
  }
  const all = [...problems.planted, ...problems.unprintable, ...problems.core, ...problems.walker];
  if (all.length || !planted.caughtByBoth) {
    if (all.length) {
      ui.out(); ui.wrap('Disagreements: a fact or a reader is wrong; look before trusting the fact', ui.width - 4).forEach((l, k) => ui.out('  ' + (k ? ui.dim(l) : ui.bold(l))));
      const cap = DETAILS ? 60 : 10;
      for (const p of all.slice(0, cap)) ui.out('    ' + ui.bad(ui.trunc(p, ui.width - 6)));
      if (all.length > cap) ui.out('    ' + ui.dim(`… and ${all.length - cap} more (make oracle DETAILS=1)`));
    }
    ui.verdict('fail', 'FAILED', all.length ? `${all.length} disagreement${all.length === 1 ? '' : 's'}` : 'The self-test caught nothing', Date.now() - T0);
    process.exit(1);
  }
  ui.verdict('gold', 'PASSED', WRITE ? 'Every fact is confirmed twice; evidence labels updated.' : 'Every fact is confirmed by two readers.', Date.now() - T0);
  if (!DETAILS) ui.hint('each entry, fact by fact', 'make oracle DETAILS=1');
}
