#!/usr/bin/env node
// order-scan.mjs <out.json> <run1/lcm> <run2/lcm> ...
// stellar-core writes some ledger-entry changes in a per-process random order (hash-map iteration with a
// random salt). Given many fresh runs of one recipe configuration, this records for every ledger each raw byte
// ordering seen (sha256 and how many runs produced it) and the order-normalised sha256. The normalised hash
// must be the same in every run: two values mean the content itself varies, and the scan fails.
// Entries use this to pin change_order {stable, normalized_sha256, runs, raw[]}.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { sha256, normalisedSha256 } from './lib.mjs';

const [out, ...dirs] = process.argv.slice(2);
if (!out || dirs.length < 2) { console.error('usage: order-scan.mjs <out.json> <run/lcm> <run/lcm> ...'); process.exit(2); }
const runInfo = (d) => { const f = join(dirname(d), 'run.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const config = runInfo(dirs[0]);
for (const d of dirs) { const c = runInfo(d); if (JSON.stringify(c) !== JSON.stringify(config)) { console.error(`${d}: run.json differs from ${dirs[0]}`); process.exit(2); } }
const manifest = JSON.parse(readFileSync(join(dirname(dirs[0]), 'manifest.json'), 'utf8'));
const stepsAt = new Map();
for (const s of manifest.steps ?? []) if (s.ledger) stepsAt.set(s.ledger, [...(stepsAt.get(s.ledger) ?? []), s.name]);

const list = (d) => readdirSync(d).filter((f) => /^ledger-\d+\.xdr$/.test(f)).sort();
const files = list(dirs[0]);
for (const d of dirs) if (list(d).join() !== files.join()) { console.error(`${d}: different ledger files from ${dirs[0]}`); process.exit(1); }
const ledgers = []; let bad = 0;
for (const f of files) {
  const seq = Number(f.match(/\d+/)[0]);
  const raw = new Map(); const normOf = new Map(); const norms = new Set();
  for (const d of dirs) {
    const b = readFileSync(join(d, f)); const h = sha256(b);
    raw.set(h, (raw.get(h) ?? 0) + 1);
    if (!normOf.has(h)) normOf.set(h, normalisedSha256('LedgerCloseMeta', b));
    norms.add(normOf.get(h));
  }
  const row = { ledger: seq, steps: stepsAt.get(seq) ?? [], stable: raw.size === 1,
    normalized_sha256: norms.size === 1 ? [...norms][0] : [...norms],
    raw: [...raw].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([sha, runs]) => ({ sha256: sha, runs })) };
  if (norms.size > 1) { bad++; console.log(`  ${f}: CONTENT VARIES across runs (${norms.size} normalised hashes)`); }
  ledgers.push(row);
}
const unstable = ledgers.filter((l) => !l.stable);
const report = { tool: 'tools/order-scan.mjs', runs: dirs.length, config,
  summary: { ledgers: ledgers.length, stable: ledgers.length - unstable.length, order_varies: unstable.length,
    max_orderings: Math.max(...ledgers.map((l) => l.raw.length)), content_varies: bad }, ledgers };
writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(`  ${dirs.length} runs, ${ledgers.length} ledgers: ${ledgers.length - unstable.length} byte-identical in every run, ` +
  `${unstable.length} vary only in change order (up to ${report.summary.max_orderings} orderings), ${bad} vary in content`);
for (const l of unstable) console.log(`    ledger ${l.ledger} [${l.steps.join(', ') || 'setup'}]: ${l.raw.map((r) => r.runs).join('/')} runs per ordering`);
process.exit(bad ? 1 : 0);
