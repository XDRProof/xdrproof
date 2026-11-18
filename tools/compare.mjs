// compare.mjs <runA/lcm> <runB/lcm> [<entry-id>[@<variant-key>]=<ledger-NNN.xdr> ...]   (variant default p30-mainnet-generated)
// Compares two fresh generator runs ledger by ledger (raw bytes, then after change-order
// normalisation), and checks that each named corpus entry's shipped bytes are reproduced:
// identical raw bytes, or the same order-normalised content.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, normalisedSha256 } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [a, b, ...checks] = process.argv.slice(2);
const files = readdirSync(a).filter((f) => /^ledger-\d+\.xdr$/.test(f)).sort();
let raw = 0, norm = 0, differ = 0, upgrade = 0;
for (const f of files) {
  if (f === 'ledger-002.xdr') { upgrade++; continue; } // protocol-upgrade ledger: never an entry
  const x = readFileSync(join(a, f)), y = existsSync(join(b, f)) ? readFileSync(join(b, f)) : null;
  if (!y) { differ++; console.log(`  ${f}: missing in second run`); continue; }
  if (x.equals(y)) { raw++; continue; }
  if (normalisedSha256('LedgerCloseMeta', x) === normalisedSha256('LedgerCloseMeta', y)) { norm++; console.log(`  ${f}: same content after normalisation (change order or diagnostic timing)`); continue; }
  differ++; console.log(`  ${f}: CONTENT DIFFERS`);
}
console.log(`  ${files.length - upgrade} ledgers: ${raw} byte-identical, ${norm} identical after normalisation, ${differ} different`);

let bad = differ > 0;
for (const c of checks) {
  const [lhs, file] = c.split('='); const [id, key = 'p30-mainnet-generated'] = lhs.split('@');
  const entry = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
  const v = entry.variants.find((x) => x.key === key);
  if (!v) { bad = true; console.log(`  ${id}@${key}: no such variant`); continue; }
  const got = readFileSync(join(a, file));
  const shipped = readFileSync(join(ROOT, 'entries', id, v.file));
  const same = got.equals(shipped) ? 'byte-identical'
    : normalisedSha256('LedgerCloseMeta', got) === normalisedSha256('LedgerCloseMeta', shipped) ? 'same content (other change order)' : null;
  if (!same) bad = true;
  console.log(`  ${id}@${key}: ${same ?? 'NOT REPRODUCED'} (run sha256 ${sha256(got).slice(0, 12)}, shipped ${v.sha256.slice(0, 12)})`);
}
process.exit(bad ? 1 : 0);
