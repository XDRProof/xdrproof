// atoms.mjs: what each built corpus entry is about, as a set of atoms (shared by novelty.mjs and coverage-report.mjs).
//
//   U:<Union.ARM> and E:<Enum.MEMBER>   reached, in any of the entry's variants, by the ledger's own shape outside
//                                       every transaction (header, tx-set phases, upgrades, evicted keys), plus
//                                       for a transaction-focused entry its focus envelope and focus result meta
//                                       (fee changes, apply meta, post-apply fees). Other transactions sharing the
//                                       container count for nothing. The walker attributes each hit to the
//                                       innermost segment it falls in.
//   H:<hazard>                          each hazard the entry targets
//   S:<sighting>                        each upstream issue it reproduces
//   P:<hazard>|<placement>              each (hazard, placement) pair
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { once } from 'node:events';
import { loadDefs, Walker } from './walker.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
export const DEFS = loadDefs(join(ROOT, 'tools/coverage/defs/xdr-v30.0.json'));
const ENVELOPE = 'TransactionEnvelope', RESULT_META = ['TransactionResultMeta', 'TransactionResultMetaV1'];
const bytesOf = (f) => (f.endsWith('.zst') ? zstdDecompressSync(readFileSync(f)) : readFileSync(f));

export function loadEntries() {
  return readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort()
    .map((id) => JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8')));
}

// The native reader's transaction hashes for every variant. The request is written line by line with backpressure,
// yielding now and then, so the event loop (and a live row) never waits on one 100 MB string. Each file is checked
// against the sha256 in its entry.json, here and again in the worker, so both reads see the same ledger.
function nativeHashes(jobs) {
  return new Promise((resolve, reject) => {
    const p = spawn(NATIVE, { stdio: ['pipe', 'pipe', 'inherit'] }), out = [];
    let settled = false;
    const fail = (e) => { if (settled) return; settled = true; p.kill(); reject(e); };
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', fail);
    p.stdin.on('error', (e) => fail(new Error(`xdrproof-native stopped reading: ${e.message}`)));
    p.on('close', (code) => { if (settled) return; settled = true; code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(`xdrproof-native exited ${code}`)); });
    (async () => {
      for (const [i, j] of jobs.entries()) {
        if (settled) return;
        const bytes = bytesOf(j.file);
        if (sha256(bytes) !== j.v.sha256) throw new Error(`${j.e.id}@${j.v.key}: ${j.v.file} does not match the sha256 in entry.json`);
        const line = JSON.stringify({ id: i, op: 'tx_hashes', xdr: bytes.toString('base64'), network_id: createHash('sha256').update(j.v.network_passphrase).digest('hex') }) + '\n';
        if (!p.stdin.write(line)) await once(p.stdin, 'drain');
        else if (i % 8 === 7) await new Promise(setImmediate);
      }
      p.stdin.end();
    })().catch(fail);
  });
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// One variant's walk: the ledger's own segment, and the focus transaction's envelope and result meta segments.
function walkOne(j) {
  const bytes = bytesOf(j.file);
  if (sha256(bytes) !== j.sha) return { i: j.i, error: 'the file changed while it was being read (sha256 differs from entry.json)' };
  const w = new Walker(DEFS, 1500, [ENVELOPE, ...RESULT_META]); w.run(bytes, j.type);
  const hits = [...w.segments[0].hits]; // the ledger's own shape: every reader of the file meets it
  if (j.ledger) return { i: j.i, hits };
  if (typeof j.hash !== 'string' || !j.hash) return { i: j.i, error: 'focus names neither the ledger nor a transaction hash' };
  // a result meta starts with the result pair's transaction hash (after a void ext in V1): its first value read
  const res = w.segments.filter((s) => RESULT_META.includes(s.type) && s.first === j.hash);
  const env = w.segments.find((s) => s.type === ENVELOPE && s.index === j.env);
  if (j.env < 0 || !env || res.length !== 1) return { i: j.i, error: `focus ${j.hash} not found (envelope ${j.env}, result metas ${res.length})` };
  return { i: j.i, hits: [...hits, ...env.hits, ...res[0].hits] };
}

// a worker thread: walks its share and reports each result as it finishes
if (!isMainThread && workerData?.atomsJobs) {
  for (const j of workerData.atomsJobs) parentPort.postMessage(walkOne(j));
}

// Returns { atoms: Map<entry id, Set<atom>>, variants: number }. The walks are split across worker threads (the
// walker is pure JavaScript and one ledger takes milliseconds to a second), largest files first, dealt round-robin.
// onProgress(done, total) is called as variants finish.
export async function entryAtoms(entries, { onProgress = () => {} } = {}) {
  // 1. transaction hashes of every variant's envelopes, in transaction-set order (one native call for all)
  const jobs = entries.flatMap((e) => e.variants.map((v) => ({ e, v, file: join(ROOT, 'entries', e.id, v.file) })));
  const replies = (await nativeHashes(jobs)).trim().split('\n').map(JSON.parse);
  for (const r of replies) if (r.status !== 'ok') throw new Error(`native tx_hashes failed for ${jobs[r.id].e.id}@${jobs[r.id].v.key}: ${r.message}`);

  // 2. walk each variant once, in parallel
  const work = jobs.map((j, i) => ({ i, file: j.file, type: j.e.xdr_type, size: statSync(j.file).size, sha: j.v.sha256, ledger: !!j.v.focus?.ledger,
    hash: j.v.focus?.tx_hash ?? null, env: j.v.focus?.ledger ? -1 : replies[i].hashes.indexOf(j.v.focus?.tx_hash) }));
  const n = Math.max(1, Math.min(availableParallelism() - 1, 8, Math.ceil(work.length / 16)));
  const shares = Array.from({ length: n }, () => []);
  [...work].sort((a, b) => b.size - a.size).forEach((j, k) => shares[k % n].push(j));
  const results = new Array(jobs.length); let done = 0;
  await new Promise((resolve, reject) => {
    const workers = []; let live = n, failed = false;
    const stop = (err) => { if (failed) return; failed = true; Promise.allSettled(workers.map((w) => w.terminate())).then(() => reject(err)); };
    for (const share of shares) {
      let w;
      try { w = new Worker(new URL(import.meta.url), { workerData: { atomsJobs: share } }); } catch (e) { stop(e); return; }
      workers.push(w);
      w.on('message', (r) => {
        if (r.error) return stop(new Error(`${jobs[r.i].e.id}@${jobs[r.i].v.key}: ${r.error}`));
        results[r.i] = r.hits; onProgress(++done, jobs.length);
      });
      w.on('error', stop);
      w.on('exit', (code) => { if (code !== 0 && !failed) stop(new Error(`an atoms worker exited ${code}`)); else if (--live === 0 && !failed) resolve(); });
    }
  });
  const atoms = new Map(entries.map((e) => [e.id, new Set()]));
  for (const [i, j] of jobs.entries()) { const mine = atoms.get(j.e.id); for (const h of results[i]) mine.add(h); }
  for (const e of entries) {
    const mine = atoms.get(e.id);
    for (const h of e.hazards) { mine.add(`H:${h.id}`); mine.add(`P:${h.id}|${h.placement.trim().toLowerCase().replace(/\s+/g, ' ')}`); }
    for (const s of e.sightings) mine.add(`S:${typeof s === 'string' ? s : s.url ?? s.id ?? JSON.stringify(s)}`);
  }
  return { atoms, variants: jobs.length };
}
