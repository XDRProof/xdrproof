// summarize.mjs <lcm-dir> [from] [to]: one line per transaction in each ledger file:
// result code, operation types and results, ledger-entry change kinds, event counts.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decode } from './lib.mjs';

const [dir, from = 0, to = 1e9] = process.argv.slice(2);
const key = (o) => (o && typeof o === 'object' ? Object.keys(o)[0] : String(o));
for (const f of readdirSync(dir).filter((x) => /^ledger-\d+\.xdr$/.test(x)).sort()) {
  const seq = Number(f.match(/\d+/)[0]);
  if (seq < Number(from) || seq > Number(to)) continue;
  const lcm = JSON.parse(decode('LedgerCloseMeta', readFileSync(join(dir, f))));
  const v = lcm[key(lcm)];
  for (const tp of v.tx_processing) {
    const res = tp.result.result.result;
    const code = key(res);
    const inner = res[code];
    const opResults = Array.isArray(inner) ? inner : inner?.result?.result ? inner.result.result[key(inner.result.result)] : [];
    const meta = tp.tx_apply_processing[key(tp.tx_apply_processing)];
    const ops = (meta.operations ?? []).map((o, i) => {
      const r = Array.isArray(opResults) && opResults[i] ? JSON.stringify(opResults[i].op_inner ?? opResults[i]).slice(0, 70) : '';
      const ch = (o.changes ?? []).map((c) => `${key(c)}:${key(c[key(c)]?.data ?? c[key(c)])}`).join(',');
      return `    op${i} ${r} | changes ${ch} | events ${(o.events ?? []).length}`;
    });
    console.log(`L${seq} ${code}${typeof inner === 'object' && !Array.isArray(inner) && inner?.result ? ' inner=' + key(inner.result.result) : ''} fee=${tp.result.result.fee_charged}`);
    for (const l of ops) console.log(l);
  }
}
