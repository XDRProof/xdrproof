#!/usr/bin/env node
// Builds the conformance vectors that are not corpus entries, deterministically, into this directory:
//   lane-s.json   invalid XDR (and JSON) every reader must reject, plus valid controls; bytes assembled by hand
//                 from the XDR definitions (Stellar-contract.x, Stellar-transaction.x), no SDK involved
//   depth.json    an ScVal vector nested N deep, for the depth ladder
//   strkey.json   SEP-0023's test vectors, plus up to 20 distinct addresses of each kind found in the corpus
// usage: node conformance/vectors/build.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { zstdDecompressSync } from 'node:zlib';
import { decode as strkeyDecode, account as strkeyAccount } from '../../tools/strkey.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../..');
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const cat = (...p) => Buffer.concat(p);
const b64 = (b) => b.toString('base64');
const pad = (b) => cat(b, Buffer.alloc((4 - (b.length % 4)) % 4));
// ScVal discriminants (Stellar-contract.x SCValType)
const SCV = { BOOL: 0, VOID: 1, U32: 3, U64: 5, BYTES: 13, SYMBOL: 15, VEC: 16 };
// a path payment strict send (OperationType 13) with n path assets, all native (AssetType 0)
const ACCOUNT = cat(u32(0), Buffer.alloc(32, 7)); // MuxedAccount KEY_TYPE_ED25519 + key
const ppss = (n) => cat(u32(0), u32(13), u32(0), u64(10), ACCOUNT, u32(0), u64(1), u32(n), ...Array.from({ length: n }, () => u32(0)));
// the JSON twin uses the same destination key (32 bytes of 7) as ACCOUNT
const ppssJson = (n) => ({ source_account: null, body: { path_payment_strict_send: { send_asset: 'native', send_amount: '10',
  destination: strkeyAccount(Buffer.alloc(32, 7)), dest_asset: 'native', dest_min: '1', path: Array.from({ length: n }, () => 'native') } } });

const laneS = [
  { id: 'control/u64', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.U64), u64(42))), expect: 'accept', why: 'a valid SCV_U64' },
  { id: 'control/path-5', op: 'decode', type: 'Operation', xdr: b64(ppss(5)), expect: 'accept', why: 'a path of five assets, the maximum' },
  { id: 'control/path-5-json', op: 'encode_json', type: 'Operation', json: ppssJson(5), expect: 'accept', expect_xdr: b64(ppss(5)), why: 'the same as SEP-0051 JSON; must encode to exactly control/path-5' },
  { id: 'truncated', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.U64), u64(42)).subarray(0, 11)), expect: 'reject', why: 'SCV_U64 with 7 of its 8 bytes' },
  { id: 'trailing-bytes', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.U32), u32(7), u32(0))), expect: 'reject', why: 'a complete SCV_U32 followed by four more bytes' },
  { id: 'bool-word-2', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.BOOL), u32(2))), expect: 'reject', why: 'an XDR bool must be 0 or 1' },
  { id: 'unknown-discriminant', op: 'decode', type: 'ScVal', xdr: b64(u32(99)), expect: 'reject', why: 'SCValType 99 does not exist' },
  { id: 'negative-discriminant', op: 'decode', type: 'ScVal', xdr: b64(u32(0xffffffff)), expect: 'reject', why: 'SCValType -1 does not exist' },
  { id: 'symbol-33', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.SYMBOL), u32(33), pad(Buffer.alloc(33, 0x61)))), expect: 'reject', why: 'SCSymbol is string<32>' },
  { id: 'non-zero-padding', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.BYTES), u32(1), Buffer.from([0x41, 1, 2, 3]))), expect: 'reject', why: 'XDR padding bytes must be zero (RFC 4506 section 3)' },
  { id: 'optional-flag-2', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.VEC), u32(2), u32(0))), expect: 'reject', why: 'SCV_VEC holds an optional SCVec; its presence word must be 0 or 1' },
  { id: 'huge-length-no-data', op: 'decode', type: 'ScVal', xdr: b64(cat(u32(SCV.BYTES), u32(0x7fffffff))), expect: 'reject', why: 'a length of 2^31-1 with no bytes behind it; must fail fast, without allocating for the length (rs-stellar-xdr#581)' },
  { id: 'path-6', op: 'decode', type: 'Operation', xdr: b64(ppss(6)), expect: 'reject', why: 'PathPaymentStrictSendOp.path is Asset<5>' },
  { id: 'path-6-json', op: 'encode_json', type: 'Operation', json: ppssJson(6), expect: 'reject', why: 'the same as SEP-0051 JSON: an encoder must not emit invalid XDR (rs-stellar-xdr#598)' },
];

const DEPTHS = [64, 100, 128, 200, 245, 246, 256, 500, 512, 513, 1000, 1500, 1501, 2000, 4000];
const nested = (d) => { let b = u32(SCV.VOID); for (let i = 1; i < d; i++) b = cat(u32(SCV.VEC), u32(1), u32(1), b); return b; }; // d ScVal levels
const depth = DEPTHS.map((d) => ({ id: `depth-${d}`, depth: d, op: 'decode', type: 'ScVal', xdr: b64(nested(d)) }));

// SEP-0023's own vectors
const md = readFileSync(join(ROOT, 'tools/vectors/sep-0023.md'), 'utf8');
const section = (t) => md.split(`### ${t}`)[1].split(/\n### |\n## /)[0];
const keys = (t) => [...t.matchAll(/Strkey:?\s*`([A-Z2-7]+)`/gs)].map((m) => m[1]);
const strkey = [];
for (const k of keys(section('Valid test cases'))) { const { kind, payload } = strkeyDecode(k); strkey.push({ id: `sep23/valid/${k}`, strkey: k, expect: { kind, payload: payload.toString('hex') } }); }
for (const k of keys(section('Invalid test cases'))) strkey.push({ id: `sep23/invalid/${k}`, strkey: k, expect: 'reject' });
// every distinct address in the corpus, by kind (reference JSON from native rs-stellar-xdr), first 20 of each sorted
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const seen = new Map();
for (const id of readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory())) {
  const e = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
  const v = e.variants[0], f = join(ROOT, 'entries', id, v.file);
  const bytes = f.endsWith('.zst') ? zstdDecompressSync(readFileSync(f)) : readFileSync(f);
  const out = JSON.parse(execFileSync(NATIVE, { input: JSON.stringify({ id: 'x', type: 'LedgerCloseMeta', xdr: bytes.toString('base64') }) + '\n', maxBuffer: 2 ** 31 }).toString());
  JSON.stringify(out.json, (k, val) => { if (typeof val === 'string' && /^[GMPTXCWLB][A-Z2-7]{55,}$/.test(val)) { try { const { kind } = strkeyDecode(val); if (!seen.has(kind)) seen.set(kind, new Set()); seen.get(kind).add(val); } catch { /* not a strkey */ } } return val; });
}
for (const [kind, set] of [...seen].sort()) for (const k of [...set].sort().slice(0, 20)) strkey.push({ id: `corpus/${kind}/${k}`, strkey: k, expect: { kind, payload: strkeyDecode(k).payload.toString('hex') } });

const write = (name, v) => { writeFileSync(join(HERE, name), JSON.stringify(v, null, 1) + '\n'); console.log(`${name}: ${v.length} vectors`); };
write('lane-s.json', laneS); write('depth.json', depth); write('strkey.json', strkey);
console.log('corpus strkey kinds:', [...seen].map(([k, s]) => `${k} ${s.size}`).join(', '));
