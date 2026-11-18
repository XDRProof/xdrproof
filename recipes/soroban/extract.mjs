// extract.mjs <run-dir> <out-dir>: split core's framed METADATA_OUTPUT_STREAM into one raw
// LedgerCloseMeta file per ledger (ledger-<seq>.xdr) and write SHA256SUMS.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [run, out] = process.argv.slice(2);
const buf = readFileSync(run + '/meta.xdr'); mkdirSync(out, { recursive: true });
let off = 0, seq = 1, sums = '';
while (off < buf.length) {
  const len = buf.readUInt32BE(off) & 0x7fffffff; // XDR record marking: last-fragment bit + length
  const rec = buf.subarray(off + 4, off + 4 + len); off += 4 + len; seq++;
  const name = `ledger-${String(seq).padStart(3, '0')}.xdr`;
  writeFileSync(`${out}/${name}`, rec);
  sums += `${createHash('sha256').update(rec).digest('hex')}  ${name}  ${rec.length}\n`;
}
writeFileSync(`${out}/SHA256SUMS`, sums);
console.log(`${seq - 1} ledgers -> ${out}`);
