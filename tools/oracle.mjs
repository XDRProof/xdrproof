#!/usr/bin/env node
// xdrproof oracle: are the corpus's expected facts confirmed by readers that share no code with the
// decoders under test?
//   walker : XDRProof's schema walker (xdr.json only, no SDK)
//   core   : stellar-core's own decoder (dump-xdr)
// For each fact, its expected primitive values must appear in each reader's output for that ledger.
// Values that are enum names (e.g. "success", "persistent") are not value-checkable and are skipped.
// A checkable value missing from a reader is a DISAGREEMENT: either the fact or a reader is wrong.
//
// usage: node tools/oracle.mjs [--write]   (--write adds/removes the "core" and "walker" evidence labels)
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';
import { loadDefs, Walker } from './walker.mjs';
import { coreValues } from './core-facts.mjs';
import { pointer } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const defs = loadDefs(join(ROOT, 'tools/coverage/defs/xdr-v30.0.json'));
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

function leaves(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => leaves(x, out));
  else if (v !== null && v !== undefined) out.push(String(v));
  return out;
}
const expectedValues = (fact) => ('equals' in fact ? leaves(fact.equals) : 'some' in fact ? leaves(Object.values(fact.some)) : []);

const ids = readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort();
const jobs = [];
for (const id of ids) {
  const entry = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
  for (const v of entry.variants) jobs.push({ id, entry, v, bytes: bytesOf(join(ROOT, 'entries', id, v.file)) });
}

const core = coreValues(jobs.map((j) => j.bytes));
let disagreements = 0;
// Self-test: every expected value of 10+ digits (64-bit amounts, IDs, fees) is changed in its last digit and both
// readers are asked again. A reader that confirms a changed value is not reading what it claims to. The oracle checks
// that a value occurs in the ledger (the exact path is verify.mjs's job), so a changed value that happens to occur
// elsewhere in the same ledger is counted as a coincidence, not a failure; one reader alone accepting it is a failure.
const planted = { tried: 0, caughtByBoth: 0, coincidence: 0, oneReader: 0 };
const verdicts = new Map(); // id -> fact index -> {core:[bool per variant], walker:[...]}
for (const [i, j] of jobs.entries()) {
  const walker = new Walker(defs); const w = walker.run(j.bytes, j.entry.xdr_type); const hits = walker.hits; // fresh per ledger
  const c = core[i];
  j.entry.expected.facts.forEach((f, k) => {
    if (f.variants && !f.variants.includes(j.v.key)) return;
    const vals = expectedValues(f);
    // v<n> is the SEP-0051 name of a void arm of an int-discriminated union (e.g. ext "v0"): structure, not a value
    const checkable = vals.filter((x) => !/^v[0-9]+$/.test(x));
    const per = verdicts.get(j.id) ?? new Map(); verdicts.set(j.id, per);
    const rec = per.get(k) ?? { core: [], walker: [], checkable: checkable.length }; per.set(k, rec);
    const wMissing = checkable.filter((x) => !walkerHas(w, hits, x));
    const cMissing = c ? checkable.filter((x) => !coreHas(c, x)) : null;
    rec.walker.push(checkable.length > 0 && wMissing.length === 0);
    rec.core.push(c !== null && checkable.length > 0 && cMissing.length === 0);
    for (const x of c ? checkable.filter((v) => /^-?[0-9]{10,}$/.test(v)) : []) {
      const changed = x.slice(0, -1) + ((Number(x.at(-1)) + 1) % 10);
      const wSees = walkerHas(w, hits, changed), cSees = coreHas(c, changed);
      planted.tried++;
      if (!wSees && !cSees) planted.caughtByBoth++;
      else if (wSees && cSees) planted.coincidence++;
      else { planted.oneReader++; disagreements++; console.log(`DISAGREE planted ${j.id}@${j.v.key} fact ${k}: ${changed} (from ${x}) seen by ${wSees ? 'walker' : 'core'} only`); }
    }
    if (c === null && checkable.length) { disagreements++; console.log(`DISAGREE core   ${j.id}@${j.v.key} fact ${k}: stellar-core could not print this ledger, so nothing is confirmed`); }
    if (wMissing.length) { disagreements++; console.log(`DISAGREE walker ${j.id}@${j.v.key} fact ${k} "${f.says.slice(0, 60)}": missing ${wMissing.join(', ')}`); }
    if (cMissing?.length) { disagreements++; console.log(`DISAGREE core   ${j.id}@${j.v.key} fact ${k} "${f.says.slice(0, 60)}": missing ${cMissing.join(', ')}`); }
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('entry', 46)} ${pad('facts', 6)} ${pad('core', 6)} ${pad('walker', 7)} not value-checkable`);
for (const id of ids) {
  const entryPath = join(ROOT, 'entries', id, 'entry.json');
  const entry = JSON.parse(readFileSync(entryPath, 'utf8'));
  const per = verdicts.get(id) ?? new Map();
  let nCore = 0, nWalker = 0, nNot = 0;
  entry.expected.facts.forEach((f, k) => {
    const r = per.get(k);
    const coreOk = r && r.core.length && r.core.every(Boolean);
    const walkerOk = r && r.walker.length && r.walker.every(Boolean);
    if (!r || r.checkable === 0) nNot++;
    if (coreOk) nCore++;
    if (walkerOk) nWalker++;
    if (WRITE) {
      const keep = f.evidence.filter((e) => e !== 'core' && e !== 'walker');
      f.evidence = [...keep, ...(coreOk ? ['core'] : []), ...(walkerOk ? ['walker'] : [])];
    }
  });
  if (WRITE) writeFileSync(entryPath, JSON.stringify(entry, null, 2) + '\n');
  console.log(`${pad(id, 46)} ${pad(entry.expected.facts.length, 6)} ${pad(nCore, 6)} ${pad(nWalker, 7)} ${nNot}`);
}
console.log(`\nPlanted errors: ${planted.tried} expected values of 10+ digits changed in their last digit; both readers rejected ${planted.caughtByBoth}, ` +
  `${planted.coincidence} occur elsewhere in the same ledger (both readers agree), ${planted.oneReader} seen by one reader only.`);
if (!planted.caughtByBoth) { console.log('Self-test failed: no planted error was caught.'); process.exit(1); }
if (disagreements) { console.log(`\n${disagreements} disagreement(s): a fact or a reader is wrong. Investigate before trusting the fact.`); process.exit(1); }
console.log(`\nOK: every value-checkable fact is confirmed by stellar-core's own decoder and by the schema walker${WRITE ? '; evidence labels updated' : ''}.`);
