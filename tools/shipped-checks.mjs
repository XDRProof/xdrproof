#!/usr/bin/env node
// shipped-checks.mjs <lane> <protocol> <net> <flags>
// Prints the compare.mjs checks (<entry-id>@<variant-key>=ledger-NNN.xdr) for every shipped generated variant
// that a run of this configuration reproduces, read from entries/*/entry.json, so regenerate.sh never needs a
// hand-kept list. Lane comes from the variant's recipe path; protocol, network and emitter-flag profile from
// its key (p<proto>-<net>-generated[-<flags>]; no suffix means the base profile).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [lane, proto, net, flags = 'base'] = process.argv.slice(2);
const out = [];
for (const id of readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort()) {
  const entry = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
  for (const v of entry.variants) {
    const m = v.key.match(/^p(\d+)-(mainnet|testnet)-generated(?:-([a-z0-9]+))?$/);
    if (!m || v.source?.lane !== 'generated') continue;
    const vLane = String(v.source.recipe ?? '').includes('/classic/') ? 'classic' : 'soroban';
    if (vLane !== lane || m[1] !== String(proto) || m[2] !== net || (m[3] ?? 'base') !== flags) continue;
    out.push(`${id}@${v.key}=ledger-${String(v.source.ledger_seq).padStart(3, '0')}.xdr`);
  }
}
console.log(out.join(' '));
