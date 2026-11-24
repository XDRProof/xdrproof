// Reads ledgers with stellar-core's OWN decoder (C++, `stellar-core dump-xdr`, no code shared with any
// SDK) and returns, per ledger, the set of values it printed, normalised to the same canonical forms
// the schema walker produces: G/M/P/C/L addresses, exact decimal integers, hex, SEP-0051-escaped strings.
//
// Runs one container (the stellar/quickstart image pinned by digest in recipes/core-image, which ships
// stellar-core v30.0.0) with networking disabled.
// stellar-core prints 64-bit integers as bare JSON numbers and copies non-UTF-8 string bytes raw, so the
// output is read as bytes (latin1) and parsed with source-preserving number handling.
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import * as K from './strkey.mjs';
import { escapeBytes } from './walker.mjs';

export const CORE_IMAGE = process.env.XDRPROOF_CORE_IMAGE || readFileSync(new URL('../recipes/core-image', import.meta.url), 'utf8').trim();
const HEX64 = /^[0-9a-f]{64}$/;
const latin1Bytes = (s) => Buffer.from(s, 'latin1');

function canonicalString(s) {
  // strings are latin1-decoded bytes; printable ASCII stays, everything else becomes \xNN (as SEP-0051 does)
  return /^[\x20-\x7e]*$/.test(s) && !s.includes('\\') ? s : escapeBytes(latin1Bytes(s));
}

function collect(node, out) {
  if (Array.isArray(node)) { for (const x of node) collect(x, out); return; }
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    // muxed account: {id, accountID: G…} or {id, ed25519: hex}
    if ('id' in node && ('accountID' in node || 'ed25519' in node) && keys.length === 2) {
      const raw = node.accountID ? K.decode(node.accountID).payload : Buffer.from(node.ed25519, 'hex');
      out.add(K.muxed(raw, BigInt(node.id)));
    }
    // signer keys print as their union arm: {"type": "SIGNER_KEY_TYPE_HASH_X", "hashX": hex} (and preAuthTx)
    if (typeof node.hashX === 'string' && HEX64.test(node.hashX)) out.add(K.hashX(Buffer.from(node.hashX, 'hex')));
    if (typeof node.preAuthTx === 'string' && HEX64.test(node.preAuthTx)) out.add(K.preAuthTx(Buffer.from(node.preAuthTx, 'hex')));
    // muxed contract (CAP-0084): {id, contractId: C…}
    if ('id' in node && 'contractId' in node && keys.length === 2) out.add(K.muxedContract(K.decode(node.contractId).payload, BigInt(node.id)));
    // signed-payload signer: {ed25519: hex, payload: hex}
    if ('ed25519' in node && 'payload' in node && keys.length === 2) out.add(K.signedPayload(Buffer.from(node.ed25519, 'hex'), Buffer.from(node.payload, 'hex')));
    // 128-bit and 256-bit integers
    if (keys.length === 2 && 'hi' in node && 'lo' in node) out.add(String((BigInt(node.hi) << 64n) + BigInt(node.lo)));
    if (keys.length === 4 && 'hi_hi' in node) out.add(String((BigInt(node.hi_hi) << 192n) + (BigInt(node.hi_lo) << 128n) + (BigInt(node.lo_hi) << 64n) + BigInt(node.lo_lo)));
    for (const v of Object.values(node)) collect(v, out);
    return;
  }
  if (typeof node === 'string') {
    if (/^[0-9-]+$/.test(node)) { out.add(node); return; } // a number preserved from source text
    const s = canonicalString(node);
    out.add(s);
    if (HEX64.test(s)) { out.add(K.contract(Buffer.from(s, 'hex'))); out.add(K.pool(Buffer.from(s, 'hex'))); out.add(K.claimableBalance(Buffer.from(s, 'hex'))); }
    return;
  }
  if (node !== null && node !== undefined) out.add(String(node));
}

// buffers: array of raw LedgerCloseMeta bytes. Returns an array of Set<string>, one per input
// (null where core could not print it).
export function coreValues(buffers) {
  const dir = mkdtempSync(join(tmpdir(), 'xdrproof-core-'));
  try {
    buffers.forEach((b, i) => {
      const head = Buffer.alloc(4); head.writeUInt32BE((0x80000000 | b.length) >>> 0); // XDR record mark
      writeFileSync(join(dir, `meta-${String(i).padStart(6, '0')}.xdr`), Buffer.concat([head, b]));
    });
    // one container for all ledgers; each dump goes to its own file (large mainnet ledgers print tens of MB each,
    // so one combined output would exceed Node's string limit), and a failed dump leaves an empty .fail marker
    execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '--entrypoint', 'sh', CORE_IMAGE, '-c',
      'for f in /work/meta-*.xdr; do stellar-core dump-xdr "$f" > "$f.json" 2>/dev/null || : > "$f.fail"; done'], { stdio: 'ignore' });
    const result = new Array(buffers.length).fill(null);
    buffers.forEach((_, idx) => {
      const base = join(dir, `meta-${String(idx).padStart(6, '0')}.xdr`);
      if (existsSync(base + '.fail') || !existsSync(base + '.json')) return;
      const json = JSON.parse(readFileSync(base + '.json').toString('latin1'), (key, value, ctx) => (typeof value === 'number' && ctx?.source ? ctx.source : value));
      const values = new Set(); collect(json, values); result[idx] = values;
    });
    return result;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---- the same, without blocking: for a live progress row ------------------------------------------------------
const run = (cmd, args) => new Promise((resolve) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('error', (e) => resolve({ code: -1, err: e.message }));
  p.on('close', (code) => resolve({ code, err }));
});

// Writes each ledger to a temporary folder and has stellar-core print every one, several at a time, in one
// container (no network). Returns { file(i), failed(i), cleanup() }; parse a printout with valuesFromDump(file(i)).
// onStatus(text) says what it is doing; onProgress(done, total) counts the printouts finished. The container and
// the folder are removed on every exit, including Ctrl-C.
export async function coreDump(buffers, { onStatus = () => {}, onProgress = () => {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'xdrproof-core-'));
  const name = `xdrproof-oracle-${process.pid}`, base = (i) => join(dir, `meta-${String(i).padStart(6, '0')}.xdr`);
  let running = false;
  const cleanup = () => {
    if (running) { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {} running = false; }
    rmSync(dir, { recursive: true, force: true });
  };
  process.once('exit', cleanup);
  // Ctrl-C or a kill would end the process without 'exit': stop the container and remove the folder first
  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.once(sig, () => { cleanup(); process.exit(128 + n); });
  buffers.forEach((b, i) => {
    const head = Buffer.alloc(4); head.writeUInt32BE((0x80000000 | b.length) >>> 0); // XDR record mark
    writeFileSync(base(i), Buffer.concat([head, b]));
  });
  if ((await run('docker', ['image', 'inspect', CORE_IMAGE])).code !== 0) {
    onStatus('downloading stellar-core (once)');
    const pull = await run('docker', ['pull', '--quiet', CORE_IMAGE]);
    if (pull.code !== 0) throw new Error(`docker pull ${CORE_IMAGE} failed: ${pull.err.trim().split('\n').pop()}`);
  }
  onStatus('starting stellar-core');
  // each printout goes to its own file (large mainnet ledgers print tens of MB), written under a temporary name and
  // renamed when complete, so a finished file is a finished printout; a failed one leaves an empty .fail marker
  const par = Math.max(2, Math.min(availableParallelism() - 2, 8));
  const script = `cd /work && ls meta-*.xdr | xargs -P ${par} -n 1 sh -c 'stellar-core dump-xdr "$1" > "$1.tmp" 2>/dev/null && mv "$1.tmp" "$1.json" || { rm -f "$1.tmp"; : > "$1.fail"; }' _`;
  const tick = setInterval(() => {
    try { onProgress(readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.fail')).length, buffers.length); } catch {}
  }, 250);
  running = true;
  const r = await run('docker', ['run', '--rm', '--name', name, '--network', 'none', '-v', `${dir}:/work`, '--entrypoint', 'sh', CORE_IMAGE, '-c', script]);
  running = false; clearInterval(tick);
  if (r.code !== 0) { cleanup(); throw new Error(`stellar-core could not run (docker exit ${r.code}): ${r.err.trim().split('\n').pop() ?? ''}`); }
  onProgress(buffers.length, buffers.length);
  return { file: (i) => base(i) + '.json', failed: (i) => existsSync(base(i) + '.fail') || !existsSync(base(i) + '.json'), cleanup };
}

// one printout's values, normalised as coreValues does
export function valuesFromDump(file) {
  const json = JSON.parse(readFileSync(file).toString('latin1'), (key, value, ctx) => (typeof value === 'number' && ctx?.source ? ctx.source : value));
  const values = new Set(); collect(json, values); return values;
}
