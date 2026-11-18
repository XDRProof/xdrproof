// XDRProof conformance orchestrator (prototype). node orchestrator.mjs vectors.json name=cmd ...
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const [, , vecFile, ...specs] = process.argv;
const vectors = JSON.parse(readFileSync(vecFile, 'utf8'));
const stable = (v) => JSON.stringify(v, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : 1)) : x);
const at = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
function judge(v, r) {
  if (r.status === 'unsupported') return ['skip', 'unsupported'];
  if (r.status === 'timeout' || r.status === 'crash') return ['fail', r.status];
  const e = v.expect, err = r.status === 'error';
  if (e.error) return err ? ['pass', 'rejected'] : ['fail', 'accepted: ' + stable(r.value)];
  if (e.error_or_equals) return err ? ['pass', 'rejected'] : stable(r.value) === stable(e.error_or_equals.value) ? ['pass', 'exact'] : ['fail', 'wrong value: ' + stable(r.value)];
  if (e.error_or_count) { if (err) return ['pass', 'rejected']; const n = at(r, e.error_or_count.path)?.length; return n === e.error_or_count.count ? ['pass', 'lossless'] : ['fail', `lossy: ${n} of ${e.error_or_count.count} entries: ` + stable(r.value)]; }
  if (err) return ['fail', `${r.error.stage} error: ${r.error.message}`];
  if (e.equals) return stable(r.value) === stable(e.equals.value) ? ['pass', ''] : ['fail', 'wrong value: ' + stable(r.value)];
  if (e.roundtrip) {
    if (r.xdr !== v.input.xdr) return ['fail', 're-encode differs'];
    if (r.json === undefined || e.json === undefined) return ['pass', 'bytes only (no SEP-51)'];
    return stable(r.json) === stable(e.json) ? ['pass', 'bytes + json'] : ['fail', 'json differs: ' + stable(r.json)];
  }
  return ['fail', 'no check'];
}
async function runTestee(name, cmd) {
  const child = spawn('sh', ['-c', cmd], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout }); const waiting = new Map();
  rl.on('line', (l) => { try { const m = JSON.parse(l); waiting.get(m.id)?.(m); } catch { /* ignore non-protocol lines */ } });
  child.on('exit', () => { for (const f of waiting.values()) f({ status: 'crash' }); });
  const ask = (msg) => new Promise((res) => { const t = setTimeout(() => res({ status: 'timeout' }), 10000); waiting.set(msg.id, (m) => { clearTimeout(t); waiting.delete(msg.id); res(m); }); child.stdin.write(JSON.stringify(msg) + '\n'); });
  const hello = await ask({ id: '$hello', op: 'hello' }); const results = {};
  for (const v of vectors) { const r = await ask({ id: v.id, op: v.op, input: v.input }); const [verdict, detail] = judge(v, r); results[v.id] = { verdict, detail }; }
  child.stdin.end(); return { name, implementation: hello.implementation, results };
}
const runs = []; for (const s of specs) { const i = s.indexOf('='); runs.push(await runTestee(s.slice(0, i), s.slice(i + 1))); }
writeFileSync('matrix.json', JSON.stringify({ schema: 'xdrproof.matrix/v0', vectors: vectors.map(({ id, sighting, op, oracle }) => ({ id, sighting, op, oracle })), runs }, null, 1));
const cell = (r) => ({ pass: 'pass', fail: '**FAIL**', skip: 'n/a' })[r.verdict] + (r.detail ? ` (${r.detail.slice(0, 60)})` : '');
let md = `| vector | sighting | ${runs.map((r) => r.name).join(' | ')} |\n|---|---|${runs.map(() => '---').join('|')}|\n`;
for (const v of vectors) md += `| \`${v.id}\` | ${v.sighting} | ${runs.map((r) => cell(r.results[v.id])).join(' | ')} |\n`;
writeFileSync('matrix.md', md); process.stdout.write(md);
