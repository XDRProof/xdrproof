#!/usr/bin/env node
// mined-verify.mjs: every ledger in mined/ (fetched from SDF's public lake, located by the queries in
// mined/queries/) must match its recorded sha256 and size once decompressed, round-trip byte for byte through
// native rs-stellar-xdr, carry the recorded ledger sequence and protocol, and every recorded finding must hold:
// its transaction hash is in the ledger and each of its JSON paths resolves in the SEP-0051 JSON.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { zstdDecompressSync } from 'node:zlib';
import { sha256 } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const idx = JSON.parse(readFileSync(join(ROOT, 'mined/index.json'), 'utf8'));
const files = [...new Set(idx.map((r) => r.file))];
const bytes = new Map(files.map((f) => [f, zstdDecompressSync(readFileSync(join(ROOT, f)))]));
const req = files.map((f) => JSON.stringify({ id: f, type: 'LedgerCloseMeta', xdr: bytes.get(f).toString('base64') })).join('\n') + '\n';
const decoded = new Map(execFileSync(NATIVE, { input: req, maxBuffer: 2 ** 31 }).toString().trim().split('\n').map(JSON.parse).map((r) => [r.id, r]));
const at = (doc, path) => [...path.matchAll(/\.([A-Za-z0-9_]+)|\[(\d+)\]/g)].reduce((cur, m) => {
  if (cur === undefined || cur === null) return undefined; return m[1] !== undefined ? cur[m[1]] : cur[Number(m[2])]; }, doc);

const bad = []; let paths = 0;
for (const r of idx) {
  const b = bytes.get(r.file), d = decoded.get(r.file);
  if (sha256(b) !== r.sha256 || b.length !== r.size_bytes) { bad.push(`${r.id}: sha256 or size differs`); continue; }
  if (d.status !== 'ok' || !d.identical) { bad.push(`${r.id}: native round trip ${d.status} identical=${d.identical}`); continue; }
  const v = d.json[r.lcm_arm]; const h = v?.ledger_header?.header;
  if (!h || h.ledger_seq !== r.ledger_seq || h.ledger_version !== r.protocol_version) { bad.push(`${r.id}: header seq/protocol differ`); continue; }
  const hashes = new Set(v.tx_processing.map((tp) => tp.result.transaction_hash));
  for (const f of r.findings) {
    if (f.tx_hash && !hashes.has(f.tx_hash)) bad.push(`${r.id}: finding ${f.shape} tx ${f.tx_hash.slice(0, 12)} not in ledger`);
    for (const [k, p] of Object.entries(f.json_paths ?? {})) { paths++; if (at(d.json, p) === undefined) bad.push(`${r.id}: ${f.shape} ${k} path ${p} does not resolve`); }
  }
}
// --json: one line for tools/verify.mjs, which prints every check together
if (process.argv.includes('--json')) { console.log(JSON.stringify({ check: 'mined', records: idx.length, ledgers: files.length, paths, bad_ledgers: new Set(bad.map((x) => idx.find((r) => x.startsWith(r.id + ':'))?.file)).size, problems: bad })); process.exit(bad.length ? 1 : 0); }
console.log(`mined: ${idx.length} records over ${files.length} ledgers, ${paths} JSON paths; native rs-stellar-xdr round trip, sha256, header and findings`);
if (bad.length) { for (const x of bad) console.log('  - ' + x); process.exit(1); }
console.log('OK: every mined ledger and finding verified');
