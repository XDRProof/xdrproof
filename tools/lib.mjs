// Shared helpers for XDRProof tools.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as xdrjson from '@stellar/stellar-xdr-json';

const HERE = dirname(fileURLToPath(import.meta.url));
let ready = false;
// rs-stellar-xdr 30.0.0 compiled to WASM (@stellar/stellar-xdr-json); initSync takes the module bytes.
export function xdr() {
  if (!ready) { xdrjson.initSync(readFileSync(join(HERE, 'node_modules/@stellar/stellar-xdr-json/stellar_xdr_json_bg.wasm'))); ready = true; }
  return xdrjson;
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Canonical JSON: object keys sorted, arrays kept in order.
export const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

// RFC 6901 JSON Pointer.
export const pointer = (doc, p) => p.split('/').slice(1).reduce((node, raw) => {
  if (node === undefined || node === null) return undefined;
  const k = raw.replace(/~1/g, '/').replace(/~0/g, '~');
  return Array.isArray(node) ? node[Number(k)] : node[k];
}, doc);

// Two things in LedgerCloseMeta vary between runs of the same ledger, so the normalised form removes both and
// nothing else:
// - stellar-core emits an operation's ledger-entry changes in a per-process random order across ledger keys
//   (hash-map iteration with a random salt). In every array whose key ends in "changes", the changes are
//   grouped by ledger key, each group keeps its own order (STATE before UPDATED, RESTORED before UPDATED),
//   and only the groups are sorted. A reordering inside one key's group is a real difference.
// - with ENABLE_SOROBAN_DIAGNOSTIC_EVENTS (Galexie's default), each call carries a diagnostic event
//   ["core_metrics", "invoke_time_nsecs"] whose u64 data is wall-clock execution time: in events of type
//   "diagnostic" only, that value is set to "0". Contract events with the same topics are left alone.
const isTimingMetric = (v) => v?.topics?.length === 2 && v.topics[0]?.symbol === 'core_metrics' && v.topics[1]?.symbol === 'invoke_time_nsecs' && v.data?.u64 !== undefined;
const isDiagnosticTiming = (e) => e?.type === 'diagnostic' && isTimingMetric(e.body?.v0) && e.body.v0.data.u64 !== '0';
// Identity of the ledger entry a change refers to (LedgerKey fields per entry type), or null if unknown.
const ID_FIELDS = { account: ['account_id'], trustline: ['account_id', 'asset'], offer: ['seller_id', 'offer_id'], data: ['account_id', 'data_name'],
  claimable_balance: ['balance_id'], liquidity_pool: ['liquidity_pool_id'], contract_data: ['contract', 'key', 'durability'], contract_code: ['hash'], ttl: ['key_hash'] };
function changeKey(change) {
  const [kind, x] = Object.entries(change ?? {})[0] ?? [];
  const d = kind === 'removed' ? x : x?.data; const type = d && Object.keys(d)[0]; const e = d?.[type];
  if (!e) return null;
  if (type === 'config_setting') return stable({ type, id: e.config_setting_id ?? Object.keys(e)[0] });
  const fields = ID_FIELDS[type]; if (!fields || fields.some((f) => !(f in e))) return null;
  return stable({ type, ...Object.fromEntries(fields.map((f) => [f, e[f]])) });
}
const groupSort = (items) => {
  const groups = new Map();
  items.forEach((c, i) => { const k = changeKey(c) ?? `#unkeyed-${i}`; groups.set(k, [...(groups.get(k) ?? []), c]); });
  return [...groups.values()].map((g) => [stable(g), g]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).flatMap(([, g]) => g);
};
export const normalise = (v, key = '') => {
  if (isDiagnosticTiming(v)) return normalise({ ...v, body: { ...v.body, v0: { ...v.body.v0, data: { u64: '0' } } } }, key);
  if (Array.isArray(v)) {
    const items = v.map((x) => normalise(x));
    return /changes$/.test(key) ? groupSort(items) : items;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalise(x, k)]));
  return v;
};

// Native rs-stellar-xdr 30.0.0 (tools/native, depth limit 1500). The WASM build of the same crate
// refuses some ledgers stellar-core accepted ("depth limit exceeded" on 245-deep auth trees); for
// every ledger both can read, the two give the same JSON once object keys are sorted (measured on
// 83 of 83 generated ledgers). Key order differs (native sorts keys), which `stable` ignores.
const NATIVE = join(HERE, 'native/target/release/xdrproof-native');
const decodeNative = (type, b64) => {
  const r = JSON.parse(execFileSync(NATIVE, { input: JSON.stringify({ id: '0', type, xdr: b64 }) + '\n', maxBuffer: 1 << 30 }).toString());
  if (r.status !== 'ok') throw new Error(`native ${r.stage}: ${r.message}`);
  return JSON.stringify(r.json);
};

// The WASM reader alone, with no fallback: verify.mjs uses it as the independent second reader, so its
// failures must surface, not be hidden by the native fallback below.
export const decodeWasm = (type, bytes) => xdr().decode(type, Buffer.from(bytes).toString('base64'));

// Decode one raw XDR value to SEP-0051 JSON (string) with rs-stellar-xdr: WASM first, native when
// the WASM build hits its depth limit.
export const decode = (type, bytes) => {
  const b64 = Buffer.from(bytes).toString('base64');
  try { return xdr().decode(type, b64); } catch (e) {
    if (!/depth limit/.test(String(e?.message ?? e))) throw e;
    return decodeNative(type, b64);
  }
};
export const encode = (type, json) => Buffer.from(xdr().encode(type, json), 'base64');
export const normalisedSha256 = (type, bytes) => sha256(stable(normalise(JSON.parse(decode(type, bytes)))));
