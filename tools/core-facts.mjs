// Reads ledgers with stellar-core's OWN decoder (C++, `stellar-core dump-xdr`, no code shared with any
// SDK) and returns, per ledger, the set of values it printed, normalised to the same canonical forms
// the schema walker produces: G/M/P/C/L addresses, exact decimal integers, hex, SEP-0051-escaped strings.
//
// Runs one container (the stellar/quickstart image pinned by digest in recipes/core-image, which ships
// stellar-core v30.0.0) with networking disabled.
// stellar-core prints 64-bit integers as bare JSON numbers and copies non-UTF-8 string bytes raw, so the
// output is read as bytes (latin1) and parsed with source-preserving number handling.
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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
    const out = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '--entrypoint', 'sh', CORE_IMAGE, '-c',
      'for f in /work/meta-*.xdr; do printf "\\n@@FILE %s\\n" "$f"; stellar-core dump-xdr "$f" 2>/dev/null || echo "@@FAILED"; done'],
    { maxBuffer: 1 << 30 }).toString('latin1');
    const parts = out.split(/\n@@FILE \/work\/meta-(\d+)\.xdr\n/).slice(1);
    const result = new Array(buffers.length).fill(null);
    for (let i = 0; i < parts.length; i += 2) {
      const idx = Number(parts[i]); const text = parts[i + 1];
      if (text.includes('@@FAILED')) continue;
      const json = JSON.parse(text, (key, value, ctx) => (typeof value === 'number' && ctx?.source ? ctx.source : value));
      const values = new Set(); collect(json, values); result[idx] = values;
    }
    return result;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
