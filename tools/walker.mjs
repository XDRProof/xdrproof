// XDRProof's own XDR reader: decodes bytes guided only by xdr.json (the type definitions generated
// from stellar-xdr's .x files), with no SDK decoder involved. It does two jobs:
//   - coverage: which union arms and enum members the bytes reach;
//   - an independent reading of values (accounts as G/M/P/T/X/C/L/B strkeys, 64-bit and 128/256-bit
//     integers as exact decimal strings, hashes as hex, strings escaped like SEP-0051), used to
//     confirm expected facts without trusting the decoder under test.
// The structure walk uses an explicit stack, so nesting depth is bounded only by `maxDepth`.
import { readFileSync } from 'node:fs';
import * as K from './strkey.mjs';

const BASE = { int32: 4, uint32: 4, int64: 8, uint64: 8 };

export function loadDefs(path) {
  const d = JSON.parse(readFileSync(path, 'utf8'));
  if (d.version !== 1) throw new Error('unknown xdr.json format');
  return Object.fromEntries(d.definitions.map((x) => [x.name, x]));
}

function refsOf(t, out) {
  if (Array.isArray(t)) { for (const v of t) refsOf(v, out); return; }
  if (t && typeof t === 'object') { if (t.kind === 'ref') out.add(t.name); for (const [k, v] of Object.entries(t)) if (k !== 'source') refsOf(v, out); }
}

// Every union arm and enum member reachable from the root types.
export function atoms(defs, roots) {
  const seen = new Set(), stack = [...roots], arms = new Set(), enums = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n) || !defs[n]) continue;
    seen.add(n);
    const x = defs[n]; const o = new Set(); refsOf(x, o); stack.push(...o);
    if (x.kind === 'union') for (const a of x.arms) for (const c of a.cases) arms.add(`${n}.${c.name ?? c.value}`);
    if (x.kind === 'enum') for (const m of x.members) enums.add(`${n}.${m.name}`);
  }
  return { arms, enums };
}

// SEP-0051 string rendering, as the escape-bytes crate (0.1.1) that rs-stellar-xdr uses does it: backslash
// doubled; NUL, tab, CR and LF as \0 \t \r \n; other printable ASCII kept; every other byte as lowercase \xNN.
const NAMED = { 0x00: '\\0', 0x09: '\\t', 0x0d: '\\r', 0x0a: '\\n', 0x5c: '\\\\' };
export function escapeBytes(buf) {
  let s = '';
  for (const b of buf) s += NAMED[b] ?? (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '\\x' + b.toString(16).padStart(2, '0'));
  return s;
}

export class Walker {
  constructor(defs, maxDepth = 1500) {
    this.d = defs; this.maxDepth = maxDepth;
    this.consts = Object.fromEntries(Object.values(defs).filter((x) => x.kind === 'const').map((x) => [x.name, x.value]));
    this.enumv = Object.fromEntries(Object.values(defs).filter((x) => x.kind === 'enum').map((x) => [x.name, new Map(x.members.map((m) => [m.value, m.name]))]));
    this.cases = Object.fromEntries(Object.values(defs).filter((x) => x.kind === 'union').map((x) => [x.name, new Map(x.arms.flatMap((a) => a.cases.map((c) => [c.value, [c.name ?? c.value, a]])))]));
    this.hits = new Set();
  }

  // ---- primitive readers ----
  need(n) { if (this.o + n > this.b.length) throw new Error('short read'); }
  i32() { this.need(4); const v = this.b.readInt32BE(this.o); this.o += 4; return v; }
  u32() { this.need(4); const v = this.b.readUInt32BE(this.o); this.o += 4; return v; }
  i64() { this.need(8); const v = this.b.readBigInt64BE(this.o); this.o += 8; return v; }
  u64() { this.need(8); const v = this.b.readBigUInt64BE(this.o); this.o += 8; return v; }
  bytes(n) {
    const pad = (4 - (n % 4)) % 4; this.need(n + pad);
    const v = this.b.subarray(this.o, this.o + n);
    for (let i = 0; i < pad; i++) if (this.b[this.o + n + i] !== 0) throw new Error('non-zero padding');
    this.o += n + pad; return v;
  }
  limit(t, key) { const m = t[key]; return typeof m === 'string' ? this.consts[m] : m; }
  emit(v) { this.values.add(String(v)); }
  hitUnion(name, value) {
    const c = this.cases[name].get(value); if (!c) throw new Error(`bad union case ${name}=${value}`);
    this.hits.add(`U:${name}.${c[0]}`);
    const dt = this.d[name].discriminant.type; // the discriminant's enum member counts as reached too
    if (dt.kind === 'ref' && this.enumv[dt.name]?.has(value)) this.hits.add(`E:${dt.name}.${this.enumv[dt.name].get(value)}`);
    return c;
  }

  // ---- flat semantic types: decoded directly (no nesting inside them) ----
  semantic(name) {
    switch (name) {
      case 'PublicKey': this.hitUnion('PublicKey', this.i32()); this.emit(K.account(this.bytes(32))); return true;
      case 'MuxedAccount': {
        const [label] = this.hitUnion('MuxedAccount', this.i32());
        if (label === 'KEY_TYPE_ED25519') this.emit(K.account(this.bytes(32)));
        else { const id = this.u64(); const k = this.bytes(32); this.emit(K.muxed(k, id)); this.emit(id); }
        return true;
      }
      case 'MuxedEd25519Account': { const id = this.u64(); const k = this.bytes(32); this.emit(K.muxed(k, id)); this.emit(id); return true; }
      case 'MuxedContract': { const id = this.u64(); const h = this.bytes(32); this.emit(K.muxedContract(h, id)); this.emit(id); return true; } // CAP-0084, W strkey
      case 'SignerKey': {
        const [label] = this.hitUnion('SignerKey', this.i32());
        if (label === 'SIGNER_KEY_TYPE_ED25519') this.emit(K.account(this.bytes(32)));
        else if (label === 'SIGNER_KEY_TYPE_PRE_AUTH_TX') this.emit(K.preAuthTx(this.bytes(32)));
        else if (label === 'SIGNER_KEY_TYPE_HASH_X') this.emit(K.hashX(this.bytes(32)));
        else { const k = this.bytes(32); const n = this.u32(); if (n > 64) throw new Error('payload over max'); const p = this.bytes(n); this.emit(K.signedPayload(k, p)); }
        return true;
      }
      case 'ContractID': this.emit(K.contract(this.bytes(32))); return true;
      case 'PoolID': this.emit(K.pool(this.bytes(32))); return true;
      case 'ClaimableBalanceID': this.hitUnion('ClaimableBalanceID', this.i32()); { const h = this.bytes(32); this.emit(K.claimableBalance(h)); this.emit(h.toString('hex')); } return true;
      case 'AssetCode4': case 'AssetCode12': { const n = name === 'AssetCode4' ? 4 : 12; const c = this.bytes(n); this.emit(escapeBytes(c.subarray(0, c.indexOf(0) < 0 ? n : c.indexOf(0)))); return true; }
      case 'Int128Parts': { const hi = this.i64(), lo = this.u64(); this.emit((hi << 64n) + lo); return true; }
      case 'UInt128Parts': { const hi = this.u64(), lo = this.u64(); this.emit((hi << 64n) + lo); return true; }
      case 'Int256Parts': { const a = this.i64(), b = this.u64(), c = this.u64(), e = this.u64(); this.emit((a << 192n) + (b << 128n) + (c << 64n) + e); return true; }
      case 'UInt256Parts': { const a = this.u64(), b = this.u64(), c = this.u64(), e = this.u64(); this.emit((a << 192n) + (b << 128n) + (c << 64n) + e); return true; }
      default: return false;
    }
  }

  // Walk one value of `root`; returns the set of values read.
  run(buf, root) {
    this.b = buf; this.o = 0; this.values = new Set();
    const stack = [{ t: { kind: 'ref', name: root }, depth: 0 }];
    while (stack.length) {
      const { t, depth } = stack.pop();
      if (depth > this.maxDepth) throw new Error('depth limit');
      const k = t.kind;
      if (k === 'ref') {
        const n = t.name;
        if (n in BASE) { this.emit(n === 'int32' ? this.i32() : n === 'uint32' ? this.u32() : n === 'int64' ? this.i64() : this.u64()); continue; }
        if (this.semantic(n)) continue;
        const x = this.d[n]; if (!x) throw new Error(`unknown type ${n}`);
        if (x.kind === 'typedef') { stack.push({ t: x.type, depth }); continue; }
        if (x.kind === 'enum') { const v = this.i32(); const m = this.enumv[n].get(v); if (m === undefined) throw new Error(`bad enum ${n}=${v}`); this.hits.add(`E:${n}.${m}`); continue; }
        if (x.kind === 'struct') { for (let i = x.fields.length - 1; i >= 0; i--) stack.push({ t: x.fields[i].type, depth: depth + 1 }); continue; }
        if (x.kind === 'union') {
          const dt = x.discriminant.type;
          let v;
          if (dt.kind === 'ref' && this.enumv[dt.name]) { v = this.i32(); const m = this.enumv[dt.name].get(v); if (m !== undefined) this.hits.add(`E:${dt.name}.${m}`); }
          else v = dt.kind === 'unsigned_int' || dt.name === 'uint32' ? this.u32() : this.i32();
          const [, arm] = this.hitUnion(n, v);
          if (arm.type) stack.push({ t: arm.type, depth: depth + 1 });
          continue;
        }
        throw new Error(`unsupported kind ${x.kind}`);
      }
      if (k === 'int') { this.emit(this.i32()); continue; }
      if (k === 'unsigned_int') { this.emit(this.u32()); continue; }
      if (k === 'hyper') { this.emit(this.i64()); continue; }
      if (k === 'unsigned_hyper') { this.emit(this.u64()); continue; }
      if (k === 'bool') { const v = this.u32(); if (v > 1) throw new Error('bool not 0/1'); continue; }
      if (k === 'opaque_fixed') { this.emit(this.bytes(this.limit(t, 'size')).toString('hex')); continue; }
      if (k === 'opaque_var') { const n = this.u32(); const m = this.limit(t, 'max_size'); if (m != null && n > m) throw new Error('over max'); this.emit(this.bytes(n).toString('hex')); continue; }
      if (k === 'string') { const n = this.u32(); const m = this.limit(t, 'max_size'); if (m != null && n > m) throw new Error('over max'); this.emit(escapeBytes(this.bytes(n))); continue; }
      if (k === 'optional') { const p = this.u32(); if (p > 1) throw new Error('bad optional'); if (p) stack.push({ t: t.element, depth: depth + 1 }); continue; }
      if (k === 'var_array') { const n = this.u32(); const m = this.limit(t, 'max_count'); if (m != null && n > m) throw new Error('over max'); for (let i = 0; i < n; i++) stack.push({ t: t.element, depth: depth + 1 }); continue; }
      if (k === 'array') { const n = this.limit(t, 'count') ?? this.limit(t, 'size'); for (let i = 0; i < n; i++) stack.push({ t: t.element, depth: depth + 1 }); continue; }
      throw new Error(`unsupported kind ${k}`);
    }
    if (this.o !== buf.length) throw new Error(`trailing bytes ${buf.length - this.o}`);
    return this.values;
  }
}
