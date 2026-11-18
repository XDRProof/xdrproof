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
const ENUMISH = /^[a-z][a-z0-9_]*$/;

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
const walker = new Walker(defs);
let disagreements = 0;
const verdicts = new Map(); // id -> fact index -> {core:[bool per variant], walker:[...]}
for (const [i, j] of jobs.entries()) {
  const w = walker.run(j.bytes, j.entry.xdr_type);
  const c = core[i];
  j.entry.expected.facts.forEach((f, k) => {
    if (f.variants && !f.variants.includes(j.v.key)) return;
    const vals = expectedValues(f);
    const checkable = vals.filter((x) => !(ENUMISH.test(x) && !w.has(x)));
    const per = verdicts.get(j.id) ?? new Map(); verdicts.set(j.id, per);
    const rec = per.get(k) ?? { core: [], walker: [], checkable: checkable.length }; per.set(k, rec);
    const wMissing = checkable.filter((x) => !w.has(x));
    const cMissing = c ? checkable.filter((x) => !c.has(x)) : null;
    rec.walker.push(checkable.length > 0 && wMissing.length === 0);
    rec.core.push(c !== null && checkable.length > 0 && cMissing.length === 0);
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
if (disagreements) { console.log(`\n${disagreements} disagreement(s): a fact or a reader is wrong. Investigate before trusting the fact.`); process.exit(1); }
console.log(`\nOK: every value-checkable fact is confirmed by stellar-core's own decoder and by the schema walker${WRITE ? '; evidence labels updated' : ''}.`);
