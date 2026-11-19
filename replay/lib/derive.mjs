// derive.mjs: what a correct indexer must have stored after ingesting one corpus ledger, read from the
// ledger's own meta. No indexer is consulted: every probe below is a fact the ledger states, in a
// canonical form (strkeys, decimal strings, XDR enum names), so one adapter translates its storage once.
//
// Probe kinds (replay/README.md lists each with its meaning):
//   tx.present tx.result tx.fee_charged tx.operations tx.inner_hash tx.participant op.participant
//   account.created account.removed signer.added signer.removed signer.updated
//   trustline.added trustline.removed contract.created balance.native balance.trustline
// plus one invariant, addresses.valid: every address the indexer stored decodes and is one this ledger names.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import * as K from '../../tools/strkey.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NATIVE = join(ROOT, 'tools/native/target/release/xdrproof-native');
const sha = (b) => createHash('sha256').update(b).digest();

// The bytes of a variant file, decompressed if it is a .zst.
// Decode one XDR value with rs-stellar-xdr to its SEP-0051 JSON.
export function decodeXdr(type, b64) {
  const r = JSON.parse(execFileSync(NATIVE, { input: JSON.stringify({ id: 'x', type, xdr: b64 }) + '\n', maxBuffer: 2 ** 31 }).toString());
  if (r.status !== 'ok') throw new Error(`native decode ${type} failed: ${r.message}`);
  return r.json;
}
export const variantBytes = (path) => (path.endsWith('.zst') ? zstdDecompressSync(readFileSync(path)) : readFileSync(path));

// rs-stellar-xdr (tools/native, depth 1500): the SEP-0051 JSON and the transaction hashes in tx-set order.
export function decodeLedger(bytes, passphrase) {
  const b64 = bytes.toString('base64'), nid = sha(Buffer.from(passphrase)).toString('hex');
  const out = execFileSync(NATIVE, {
    input: JSON.stringify({ id: 'd', type: 'LedgerCloseMeta', xdr: b64 }) + '\n' + JSON.stringify({ id: 'h', op: 'tx_hashes', xdr: b64, network_id: nid }) + '\n',
    maxBuffer: 2 ** 31,
  }).toString().trim().split('\n').map((l) => JSON.parse(l));
  if (out[0].status !== 'ok') throw new Error(`native decode failed: ${out[0].message}`);
  if (out[1].status !== 'ok') throw new Error(`native tx hashes failed: ${out[1].message}`);
  return { json: out[0].json, hashes: out[1].hashes };
}

// ---- envelopes ---------------------------------------------------------------------------------------
function envelopes(L, arm) {
  if (arm === 'v0') return L.tx_set.txs;
  const out = [];
  for (const ph of L.tx_set.v1.phases) {
    if (ph.v0) for (const c of ph.v0) out.push(...c.txset_comp_txs_maybe_discounted_fee.txs);
    else for (const st of ph.v1.execution_stages) for (const cl of st) out.push(...cl);
  }
  return out;
}

// A MuxedAccount (G or M) as the G account it belongs to.
const baseAccount = (m) => (m.startsWith('M') ? K.account(K.decode(m).payload.subarray(0, 32)) : m);

// { tx: the Transaction (inner one for a fee bump), source, feeSource, soroban }
function unwrap(env) {
  if (env.tx_fee_bump) {
    const fb = env.tx_fee_bump.tx, inner = fb.inner_tx.tx.tx;
    return { tx: inner, source: baseAccount(inner.source_account), feeSource: baseAccount(fb.fee_source), feeBump: true, soroban: inner.ext !== 'v0' };
  }
  if (env.tx_v0) {
    const t = env.tx_v0.tx;
    return { tx: t, source: K.account(Buffer.from(t.source_account_ed25519, 'hex')), feeSource: null, feeBump: false, soroban: false };
  }
  const t = env.tx.tx;
  return { tx: t, source: baseAccount(t.source_account), feeSource: null, feeBump: false, soroban: t.ext !== 'v0' };
}

// ---- results -----------------------------------------------------------------------------------------
// SEP-0051 renders a TransactionResultCode arm as snake case ("tx_bad_seq"); the XDR enum name is txBAD_SEQ.
const arm = (u) => (typeof u === 'string' ? u : Object.keys(u)[0]);
const codeName = (snake) => 'tx' + snake.slice(3).toUpperCase();

// ---- ledger entries ----------------------------------------------------------------------------------
export const assetCanon = (a) => {
  if (a === 'native') return 'native';
  if (a.pool_share) return `pool:${a.pool_share}`;
  const c = a.credit_alphanum4 ?? a.credit_alphanum12;
  return `${c.asset_code}:${c.issuer}`;
};
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const keyOfData = (d) => {
  if (d.account) return `account|${d.account.account_id}`;
  if (d.trustline) return `trustline|${d.trustline.account_id}|${assetCanon(d.trustline.asset)}`;
  if (d.contract_data) return `contract_data|${d.contract_data.contract}|${stable(d.contract_data.key)}|${d.contract_data.durability}`;
  const t = Object.keys(d)[0];
  return `${t}|${stable(d[t])}`;
};
const keyOfLedgerKey = (k) => {
  if (k.account) return `account|${k.account.account_id}`;
  if (k.trustline) return `trustline|${k.trustline.account_id}|${assetCanon(k.trustline.asset)}`;
  if (k.contract_data) return `contract_data|${k.contract_data.contract}|${stable(k.contract_data.key)}|${k.contract_data.durability}`;
  return null; // other kinds carry no probe
};
// One LedgerEntryChange as { op: created|updated|removed|restored|state, key, data }
function change(c) {
  const kind = Object.keys(c)[0], v = c[kind];
  if (kind === 'removed') return { op: kind, key: keyOfLedgerKey(v), data: null };
  return { op: kind, key: keyOfData(v.data), data: v.data };
}
// TransactionMeta arms v0..v4 as ordered change groups
function applyGroups(meta) {
  const a = Object.keys(meta)[0], m = meta[a];
  if (a === 'v0') return m.map((o) => o.changes);
  if (a === 'v1') return [m.tx_changes, ...m.operations.map((o) => o.changes)];
  return [m.tx_changes_before, ...m.operations.map((o) => o.changes), m.tx_changes_after];
}

// Pre-auth (T), hash-x (X), ed25519 (G) and signed-payload (P) signer keys are strkeys in SEP-0051 JSON.
const signerMap = (acct) => new Map((acct?.signers ?? []).map((s) => [s.key, s.weight]));

// The Stellar Asset Contract address of a classic asset on a network (CAP-0046-06): sha256 of
// HashIdPreimage{ENVELOPE_TYPE_CONTRACT_ID, networkId, CONTRACT_ID_PREIMAGE_FROM_ASSET, asset}.
// SEP-0051 renders an asset code's bytes as text, escaping what is not printable ASCII (\0 \t \n \r \\ \xNN).
const codeBytes = (t) => Buffer.from(t.replace(/\\(x[0-9a-fA-F]{2}|[0tnr\\])/g, (_, e) => String.fromCharCode(e[0] === 'x' ? parseInt(e.slice(1), 16) : { 0: 0, t: 9, n: 10, r: 13, '\\': 92 }[e])), 'latin1');
export function sacAddress(asset, passphrase) {
  const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  let a;
  if (asset === 'native') a = i32(0);
  else {
    const i = asset.lastIndexOf(':'), raw = codeBytes(asset.slice(0, i)), issuer = asset.slice(i + 1);
    const w = raw.length <= 4 ? 4 : 12; // stellar-core accepts codes of 1-4 characters as AlphaNum4 only, 5-12 as AlphaNum12
    const c = Buffer.alloc(w); raw.copy(c);
    a = Buffer.concat([i32(w === 4 ? 1 : 2), c, i32(0), K.decode(issuer).payload]);
  }
  return K.contract(sha(Buffer.concat([i32(8), sha(Buffer.from(passphrase)), i32(1), a])));
}

// Every strkey the ledger names, reduced to what an account column can hold (M -> G, W -> C), plus the
// strkey forms of hex identifiers that SEP-0051 renders as hex (pool ids, V0 source keys) and the asset
// contract (C...) of every classic asset the ledger names, which indexers derive and store.
function addressSet(json, passphrase) {
  const out = new Set([sacAddress('native', passphrase)]);
  const visit = (v, k) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const c = v.credit_alphanum4 ?? v.credit_alphanum12;
      if (c?.asset_code !== undefined && c?.issuer) { try { out.add(sacAddress(`${c.asset_code}:${c.issuer}`, passphrase)); } catch { /* not an asset */ } }
    }
    if (typeof v === 'string') {
      if (/^[GMCPTXLBW][A-Z2-7]{55,}$/.test(v)) {
        try {
          const { kind, payload } = K.decode(v);
          out.add(v);
          if (kind === 'M') out.add(K.account(payload.subarray(0, 32)));
          if (kind === 'W') out.add(K.contract(payload.subarray(0, 32)));
          if (kind === 'P') out.add(K.account(payload.subarray(0, 32)));
        } catch { /* not a strkey */ }
      } else if (/^[0-9a-f]{64}$/.test(v) && (k === 'pool_share' || k === 'liquidity_pool_id')) out.add(K.pool(Buffer.from(v, 'hex')));
      else if (/^[0-9a-f]{64}$/.test(v) && k === 'source_account_ed25519') out.add(K.account(Buffer.from(v, 'hex')));
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => visit(x, k));
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) visit(x, kk);
  };
  visit(json, '');
  return out;
}

// ---- the probes --------------------------------------------------------------------------------------
// derive(bytes, passphrase) -> { ledger_seq, protocol, close_time, tx_count, probes: [...], addresses: [...] }
export function derive(bytes, passphrase) {
  const { json, hashes } = decodeLedger(bytes, passphrase);
  const lcmArm = Object.keys(json)[0], L = json[lcmArm];
  const hdr = L.ledger_header.header, seq = hdr.ledger_seq, protocol = hdr.ledger_version;
  const envs = envelopes(L, lcmArm);
  if (envs.length !== hashes.length) throw new Error('envelope count differs from hash count');
  const envByHash = new Map(hashes.map((h, i) => [h, envs[i]]));
  const probes = [], seen = new Set();
  const add = (kind, at, expect) => {
    const id = [kind, ...Object.values(at)].join(' ');
    if (seen.has(id)) return; // one probe per fact (a fact can be stated twice, e.g. two ops by one source)
    seen.add(id); probes.push({ id, kind, ...at, expect });
  };

  const tps = L.tx_processing;
  tps.forEach((tp, i) => {
    const pair = tp.result, hash = pair.transaction_hash, env = envByHash.get(hash);
    if (!env) throw new Error(`tx ${hash} has a result but no envelope in the tx set`);
    const u = unwrap(env), res = pair.result.result, code = arm(res);
    add('tx.present', { tx_hash: hash }, true);
    add('tx.result', { tx_hash: hash }, codeName(code));
    // stellar-core#4188: before protocol 21 a Soroban fee bump's fee_charged omitted the refund, so the
    // result does not state the fee actually charged. No such ledger is in the corpus; refuse to guess.
    if (!(protocol < 21 && u.soroban && u.feeBump)) add('tx.fee_charged', { tx_hash: hash }, pair.result.fee_charged);
    add('tx.operations', { tx_hash: hash }, u.tx.operations.length);
    if (u.feeBump) add('tx.inner_hash', { tx_hash: hash }, res[code].transaction_hash);
    // Participants every model agrees on, as G accounts (a muxed M address belongs to its G account):
    // the transaction's source and fee source always; each operation's source when the transaction
    // succeeded. (For a failed transaction indexers differ on purpose: wallet-backend attributes only the
    // accounts that paid, Horizon every account the operations name, so neither is asserted.)
    for (const a of [u.source, u.feeSource].filter(Boolean)) add('tx.participant', { tx_hash: hash, account: a }, true);
    if (code === 'tx_success' || code === 'tx_fee_bump_inner_success')
      u.tx.operations.forEach((o, k) => add('op.participant', { tx_hash: hash, op_index: k, account: o.source_account ? baseAccount(o.source_account) : u.source }, true));

    // Entry changes this transaction caused (fee charging, the apply, and post-apply refunds).
    const groups = [tp.fee_processing ?? [], ...applyGroups(tp.tx_apply_processing), tp.post_tx_apply_fee_processing ?? []];
    for (const g of groups) {
      const before = new Map();
      for (const c of g.map(change)) {
        if (c.op === 'state') { before.set(c.key, c.data); continue; }
        const prev = before.get(c.key) ?? null;
        if (c.key?.startsWith('account|')) {
          const id = c.key.split('|')[1];
          if (c.op === 'created') add('account.created', { tx_hash: hash, account: id }, true);
          if (c.op === 'removed') { add('account.removed', { tx_hash: hash, account: id }, true); continue; }
          if (c.op === 'created' || c.op === 'updated') {
            const o = signerMap(prev?.account), n = signerMap(c.data.account);
            for (const [k, w] of n) {
              if (!o.has(k)) add('signer.added', { tx_hash: hash, account: id, signer: k }, w);
              else if (o.get(k) !== w) add('signer.updated', { tx_hash: hash, account: id, signer: k }, w);
            }
            for (const k of o.keys()) if (!n.has(k)) add('signer.removed', { tx_hash: hash, account: id, signer: k }, true);
          }
        }
        if (c.key?.startsWith('trustline|')) {
          const [, acct, asset] = c.key.split('|');
          if (c.op === 'created') add('trustline.added', { tx_hash: hash, account: acct, asset }, true);
          if (c.op === 'removed') add('trustline.removed', { tx_hash: hash, account: acct, asset }, true);
        }
        if (c.op === 'created' && c.data?.contract_data && c.data.contract_data.key === 'ledger_key_contract_instance')
          add('contract.created', { tx_hash: hash, contract: c.data.contract_data.contract }, true);
        if (c.op !== 'removed') before.set(c.key, c.data); // a later change in the group compares to this one
      }
    }
  });

  // End-of-ledger state, in apply order: every fee charge, then each transaction's apply, then the
  // post-apply refunds, then upgrades. A balance is asserted where the ledger changes it (or creates or
  // removes its entry): an untouched balance is the indexer's prior state, which a session starts without.
  const initial = new Map(), final = new Map();
  const write = (g) => {
    for (const c of (g ?? []).map(change)) {
      if (!c.key) continue;
      if (!initial.has(c.key)) initial.set(c.key, c.op === 'created' ? null : c.op === 'state' ? c.data : undefined);
      if (c.op !== 'state') final.set(c.key, c.op === 'removed' ? null : c.data);
    }
  };
  tps.forEach((tp) => write(tp.fee_processing));
  tps.forEach((tp) => applyGroups(tp.tx_apply_processing).forEach(write));
  tps.forEach((tp) => write(tp.post_tx_apply_fee_processing));
  for (const u of L.upgrades_processing ?? []) write(u.changes);
  const balance = (d) => d && (d.account ? d.account.balance : d.trustline.balance);
  for (const [key, data] of final) {
    if (!key.startsWith('account|') && !key.startsWith('trustline|')) continue;
    const before = initial.get(key);
    if (before !== undefined && balance(before) === balance(data) && (before === null) === (data === null)) continue; // unchanged
    if (key.startsWith('account|')) add('balance.native', { account: key.split('|')[1] }, data ? data.account.balance : null);
    if (key.startsWith('trustline|')) {
      const [, account, asset] = key.split('|');
      add('balance.trustline', { account, asset }, data ? data.trustline.balance : null);
    }
  }
  // Asset contract addresses ride along so an adapter keyed by contract (C...) needs no network logic.
  for (const p of probes) if (p.asset && !p.asset.startsWith('pool:')) p.asset_contract = sacAddress(p.asset, passphrase);

  return {
    ledger_seq: seq, protocol, lcm: lcmArm,
    close_time: Number(hdr.scp_value.close_time),
    hash: L.ledger_header.hash,
    tx_count: tps.length,
    probes,
    addresses: [...addressSet(json, passphrase)].sort(),
  };
}

// ---- the entries getLedgerEntries returns ---------------------------------------------------------------
// The state every entry the ledger touches is left in: [{key, xdr, ext, last_modified, live_until?}], plus
// the keys it removes (tools/native ledger_entries).
export function ledgerEntries(bytes) {
  const r = JSON.parse(execFileSync(NATIVE, { input: JSON.stringify({ id: 'e', op: 'ledger_entries', xdr: bytes.toString('base64') }) + '\n', maxBuffer: 2 ** 31 }).toString());
  if (r.status !== 'ok') throw new Error(`native ledger_entries failed: ${r.message}`);
  return { entries: r.entries, removed: r.removed };
}

// ---- the header getLedgers returns -------------------------------------------------------------------
// stellar-rpc returns headerXdr as the LedgerHeaderHistoryEntry bytes sliced out of the LedgerCloseMeta
// (stellar-rpc v30.0.1 methods/get_ledgers.go parseLedgerInfo). tools/native re-encodes the decoded entry,
// which is byte-identical because XDR is canonical; the ledger hash is sha256 of the LedgerHeader inside
// it (between the 32-byte hash and the 4-byte ext), which guards the result.
export function headerXdr(bytes) {
  const out = JSON.parse(execFileSync(NATIVE, { input: JSON.stringify({ id: 'h', op: 'ledger_header', xdr: bytes.toString('base64') }) + '\n', maxBuffer: 2 ** 31 }).toString());
  if (out.status !== 'ok') throw new Error(`native ledger_header failed: ${out.message}`);
  const h = Buffer.from(out.header_xdr, 'base64');
  if (!sha(h.subarray(32, h.length - 4)).equals(h.subarray(0, 32))) throw new Error('the re-encoded header does not hash to the ledger hash');
  return h;
}
