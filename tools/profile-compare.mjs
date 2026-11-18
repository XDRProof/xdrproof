#!/usr/bin/env node
// profile-compare.mjs <out.json> <profile>=<run/lcm> <profile>=<run/lcm> ...
// The same recipe run under different emitter-flag profiles (recipes/flags) must produce the same ledgers: for
// every ledger the header hash must be equal in all runs (a difference fails). The metadata may differ; the report
// records, per ledger, each profile's raw sha256 and normalised sha256, and for every pair of profiles in how many
// ledgers the normalised content differs. Raw bytes alone would mix flag effects with change-order noise between
// separate core processes (tools/lib.mjs normalise).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { decode, sha256, normalisedSha256 } from './lib.mjs';

const [out, ...pairs] = process.argv.slice(2);
const runs = pairs.map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; });
if (!out || runs.length < 2) { console.error('usage: profile-compare.mjs <out.json> <profile>=<run/lcm> ...'); process.exit(2); }
const list = (d) => readdirSync(d).filter((f) => /^ledger-\d+\.xdr$/.test(f)).sort();
const files = list(runs[0][1]);
for (const [name, d] of runs) if (list(d).join() !== files.join()) { console.error(`${name}: different ledger files from ${runs[0][0]}`); process.exit(1); }
const ledgers = []; let headerDiffers = 0;
const pairNames = runs.flatMap(([a], i) => runs.slice(i + 1).map(([b]) => `${a}/${b}`)); const contentDiffers = Object.fromEntries(pairNames.map((k) => [k, 0]));
for (const f of files) {
  const row = { ledger: Number(f.match(/\d+/)[0]), header_hash: null, sha256: {}, normalized_sha256: {} };
  const headers = new Set();
  for (const [name, d] of runs) {
    const b = readFileSync(join(d, f)); row.sha256[name] = sha256(b); row.normalized_sha256[name] = normalisedSha256('LedgerCloseMeta', b);
    headers.add(Object.values(JSON.parse(decode('LedgerCloseMeta', b)))[0].ledger_header.hash);
  }
  row.header_hash = headers.size === 1 ? [...headers][0] : [...headers];
  row.content_differs = pairNames.filter((k) => { const [a, b] = k.split('/'); return row.normalized_sha256[a] !== row.normalized_sha256[b]; });
  for (const k of row.content_differs) contentDiffers[k]++;
  if (headers.size !== 1) { headerDiffers++; console.log(`  ${f}: HEADER HASH DIFFERS between profiles`); }
  ledgers.push(row);
}
const report = { tool: 'tools/profile-compare.mjs', profiles: Object.fromEntries(runs.map(([n, d]) => [n, JSON.parse(readFileSync(join(dirname(d), 'run.json'), 'utf8'))])),
  summary: { ledgers: files.length, same_header_hash: files.length - headerDiffers, content_differs_by_pair: contentDiffers }, ledgers };
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(`  ${out}: ${files.length} ledgers; same header hash under all ${runs.length} profiles in ${files.length - headerDiffers}; metadata content differs: ${pairNames.map((k) => `${k} in ${contentDiffers[k]}`).join(', ')}`);
process.exit(headerDiffers ? 1 : 0);
