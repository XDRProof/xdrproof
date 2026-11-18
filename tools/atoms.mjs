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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
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

// Returns { atoms: Map<entry id, Set<atom>>, variants: number }.
export function entryAtoms(entries) {
  // 1. transaction hashes of every variant's envelopes, in transaction-set order (one native call for all)
  const jobs = entries.flatMap((e) => e.variants.map((v) => ({ e, v, bytes: bytesOf(join(ROOT, 'entries', e.id, v.file)) })));
  const reqs = jobs.map((j, i) => JSON.stringify({ id: i, op: 'tx_hashes', xdr: j.bytes.toString('base64'),
    network_id: createHash('sha256').update(j.v.network_passphrase).digest('hex') })).join('\n') + '\n';
  const replies = execFileSync(NATIVE, { input: reqs, maxBuffer: 2 ** 31 }).toString().trim().split('\n').map(JSON.parse);
  for (const r of replies) if (r.status !== 'ok') throw new Error(`native tx_hashes failed for ${jobs[r.id].e.id}@${jobs[r.id].v.key}: ${r.message}`);

  // 2. walk each variant once; take the ledger's own segment and the focus transaction's segments
  const atoms = new Map(entries.map((e) => [e.id, new Set()]));
  for (const [i, j] of jobs.entries()) {
    const w = new Walker(DEFS, 1500, [ENVELOPE, ...RESULT_META]); w.run(j.bytes, j.e.xdr_type);
    const mine = atoms.get(j.e.id); const take = (seg) => { for (const h of seg.hits) mine.add(h); };
    take(w.segments[0]); // the ledger's own shape: every reader of the file meets it
    if (j.v.focus.ledger) continue;
    const hash = j.v.focus.tx_hash;
    const env = replies[i].hashes.indexOf(hash);
    // a result meta starts with the result pair's transaction hash (after a void ext in V1): its first value read
    const res = w.segments.filter((s) => RESULT_META.includes(s.type) && s.first === hash);
    if (env < 0 || res.length !== 1) throw new Error(`${j.e.id}@${j.v.key}: focus ${hash} not found (envelope ${env}, result metas ${res.length})`);
    take(w.segments.find((s) => s.type === ENVELOPE && s.index === env)); take(res[0]);
  }
  for (const e of entries) {
    const mine = atoms.get(e.id);
    for (const h of e.hazards) { mine.add(`H:${h.id}`); mine.add(`P:${h.id}|${h.placement.trim().toLowerCase().replace(/\s+/g, ' ')}`); }
    for (const s of e.sightings) mine.add(`S:${typeof s === 'string' ? s : s.url ?? s.id ?? JSON.stringify(s)}`);
  }
  return { atoms, variants: jobs.length };
}
