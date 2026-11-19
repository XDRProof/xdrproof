// observe.mjs: answers the harness's probes from wallet-backend's database (read-only).
// stdin:  {"probes": [{id, kind, ...}]}   (protocol: replay/README.md, "observe")
// stdout: {"cursor": "<ledger>", "answers": [{id, status: present|absent|unsupported|error, value}], "tables": {...}}
// A probe names a fact by its key (transaction, account, signer, asset); the answer is what wallet-backend
// stored under that key. The session database holds this session's ledgers only, so whole tables are read.
import { execFileSync } from 'node:child_process';
import * as K from '../../../tools/strkey.mjs';

const DB = 'xdrproof-wb-db', SDB = `s_${process.env.XDRPROOF_SESSION_ID}`;
const sql = (q) => execFileSync('docker', ['exec', '-i', DB, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-tA', '-d', SDB], { input: q, maxBuffer: 2 ** 30 }).toString();
// every JSON number as its exact source text: TOIDs pass 2^53
const parse = (t) => JSON.parse(t, (k, v, ctx) => (typeof v === 'number' ? ctx.source : v));

const req = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (c) => (s += c)); process.stdin.on('end', () => r(s)); }));

// ---- read the database ---------------------------------------------------------------------------------
const columns = {};
for (const line of sql(`SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public'`).trim().split('\n')) {
  const [t, c] = line.split('.'); (columns[t] ??= new Set()).add(c);
}
const has = (t, c) => columns[t] && (!c || columns[t].has(c));
const rows = (t, select = 'to_jsonb(x)') => (has(t) ? `(SELECT coalesce(json_agg(${select}), '[]') FROM ${t} x)` : `'[]'::json`);
const q = `SELECT json_build_object(
  'cursor', (SELECT value FROM ingest_store WHERE key = 'latest_ingest_ledger'),
  'transactions', ${rows('transactions')},
  'transactions_accounts', ${rows('transactions_accounts')},
  'operations', ${rows('operations', `json_build_object('id', x.id)`)},
  'operations_accounts', ${rows('operations_accounts')},
  'state_changes', ${rows('state_changes')},
  'native_balances', ${rows('native_balances')},
  'trustline_balances', ${has('trustline_balances') && has('trustline_assets')
    ? `(SELECT coalesce(json_agg(to_jsonb(x) || jsonb_build_object('code', a.code, 'issuer', a.issuer)), '[]') FROM trustline_balances x JOIN trustline_assets a ON a.id = x.asset_id)` : `'[]'::json`},
  'liquidity_pool_balances', ${rows('liquidity_pool_balances')},
  'sac_balances', ${rows('sac_balances')}
)`;
const D = parse(sql(q));

// ---- wallet-backend's storage forms -> canonical forms ----------------------------------------------------
const KIND = { 48: 'G', 144: 'S', 152: 'T', 184: 'X', 96: 'M', 120: 'P', 16: 'C', 88: 'L', 8: 'B', 176: 'W' };
const hexOf = (v) => (typeof v === 'string' && v.startsWith('\\x') ? v.slice(2) : null);
// An address column: BYTEA is version byte + payload (types.AddressBytea); older refs stored text strkeys.
// Bytes that are no strkey come back as "raw:<hex>" so the harness can report them.
function address(v) {
  if (v == null) return null;
  const h = hexOf(v);
  if (h === null) return v;
  const b = Buffer.from(h, 'hex'), kind = KIND[b[0]];
  if (!kind) return `raw:${h}`;
  const s = K.encode(kind, b.subarray(1));
  try { K.decode(s); return s; } catch { return `raw:${h}`; }
}
const hashOf = (v) => hexOf(v) ?? v;
// Go's xdr enum String(): TransactionResultCodeTxBadAuthExtra -> txBAD_AUTH_EXTRA
const resultCode = (s) => {
  const m = /^TransactionResultCodeTx(\w+)$/.exec(s);
  return m ? 'tx' + m[1].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase() : s;
};

const txByHash = new Map(D.transactions.map((t) => [hashOf(t.hash), t]));
const participants = new Map();
for (const r of D.transactions_accounts) (participants.get(r.tx_to_id) ?? participants.set(r.tx_to_id, new Set()).get(r.tx_to_id)).add(address(r.account_id));
const opAccounts = new Map();
for (const r of D.operations_accounts) (opAccounts.get(r.operation_id) ?? opAccounts.set(r.operation_id, new Set()).get(r.operation_id)).add(address(r.account_id));
const opsOf = (toId) => { const lo = BigInt(toId), hi = lo + 4096n; return D.operations.filter((o) => BigInt(o.id) > lo && BigInt(o.id) < hi).length; };
const changesOf = (toId) => D.state_changes.filter((s) => s.to_id === toId);
const native = new Map(D.native_balances.map((r) => [address(r.account_id), r]));
const trust = new Map(D.trustline_balances.map((r) => [`${address(r.account_id)}|${r.code}:${r.issuer}`, r]));
// a pool id as hex, whether stored as hex or as an L... strkey (SEP-0051 renders a pool-share asset as L...)
const poolIdHex = (v) => { if (v == null) return null; const t = String(v); if (/^L[A-Z2-7]{55}$/.test(t)) return K.decode(t).payload.toString('hex'); return (hexOf(t) ?? t).toLowerCase(); };
const poolBal = new Map(D.liquidity_pool_balances.map((r) => [`${address(r.account_id)}|${poolIdHex(r.pool_id)}`, r]));

// ---- answers --------------------------------------------------------------------------------------------
const present = (value) => ({ status: 'present', value });
const absent = { status: 'absent' };
const unsupported = (why) => ({ status: 'unsupported', value: why });
const rowOf = (p) => txByHash.get(p.tx_hash);
function stateRow(p, cat, reason, match) {
  const t = rowOf(p);
  if (!t) return absent;
  const r = changesOf(t.to_id).find((s) => s.state_change_category === cat && s.state_change_reason === reason && match(s));
  return r ? present(r) : absent;
}
const poolHex = (asset) => poolIdHex(asset.slice(5));
const tokenMatches = (s, p) => (p.asset.startsWith('pool:')
  ? s.liquidity_pool_id != null && poolIdHex(s.liquidity_pool_id) === poolHex(p.asset)
  : address(s.token_id) === p.asset_contract);

function answer(p) {
  switch (p.kind) {
    case 'tx.present': return rowOf(p) ? present(true) : absent;
    case 'tx.result': { const t = rowOf(p); return t ? present(resultCode(t.result_code)) : absent; }
    case 'tx.fee_charged': { const t = rowOf(p); return t ? present(String(t.fee_charged)) : absent; }
    case 'tx.operations': { const t = rowOf(p); return t ? present(opsOf(t.to_id)) : absent; }
    case 'tx.inner_hash': {
      if (!has('transactions', 'inner_transaction_hash')) return unsupported('wallet-backend does not store the inner transaction hash');
      const t = rowOf(p); return t ? present(hashOf(t.inner_transaction_hash)) : absent;
    }
    case 'tx.participant': { const t = rowOf(p); return t && participants.get(t.to_id)?.has(p.account) ? present(true) : absent; }
    case 'op.participant': { // an operation's TOID is its transaction's plus the operation index + 1
      const t = rowOf(p); if (!t) return absent;
      return opAccounts.get(String(BigInt(t.to_id) + BigInt(p.op_index) + 1n))?.has(p.account) ? present(true) : absent;
    }
    case 'account.created': { const r = stateRow(p, 'ACCOUNT', 'CREATE', (s) => address(s.account_id) === p.account); return r.status === 'present' ? present(true) : r; }
    case 'account.removed': { const r = stateRow(p, 'ACCOUNT', 'MERGE', (s) => address(s.account_id) === p.account); return r.status === 'present' ? present(true) : r; }
    case 'contract.created': { const r = stateRow(p, 'ACCOUNT', 'CREATE', (s) => address(s.account_id) === p.contract); return r.status === 'present' ? present(true) : r; }
    case 'signer.added': case 'signer.updated': {
      const r = stateRow(p, 'SIGNER', p.kind === 'signer.added' ? 'ADD' : 'UPDATE', (s) => address(s.account_id) === p.account && address(s.signer_account_id) === p.signer);
      return r.status === 'present' ? present(r.value.signer_weight_new == null ? null : Number(r.value.signer_weight_new)) : r;
    }
    case 'signer.removed': { const r = stateRow(p, 'SIGNER', 'REMOVE', (s) => address(s.account_id) === p.account && address(s.signer_account_id) === p.signer); return r.status === 'present' ? present(true) : r; }
    case 'trustline.added': case 'trustline.removed': {
      const r = stateRow(p, 'TRUSTLINE', p.kind === 'trustline.added' ? 'ADD' : 'REMOVE', (s) => address(s.account_id) === p.account && tokenMatches(s, p));
      return r.status === 'present' ? present(true) : r;
    }
    case 'balance.native': { const r = native.get(p.account); return r ? present(String(r.balance)) : absent; }
    case 'balance.trustline': {
      const r = p.asset.startsWith('pool:') ? poolBal.get(`${p.account}|${poolHex(p.asset)}`) : trust.get(`${p.account}|${p.asset}`);
      return r ? present(String(p.asset.startsWith('pool:') ? r.shares : r.balance)) : absent;
    }
    case 'facts.extra': {
      // every creation, merge and trustline change wallet-backend stored, keyed as the probes are
      const hashOfTo = new Map(D.transactions.map((t) => [t.to_id, hashOf(t.hash)]));
      const out = [];
      for (const s of D.state_changes) {
        const tx = hashOfTo.get(s.to_id) ?? null, who = address(s.account_id);
        const c = s.state_change_category, r = s.state_change_reason;
        if (c === 'ACCOUNT' && r === 'CREATE') out.push(who?.startsWith('C') ? { kind: 'contract.created', tx_hash: tx, contract: who } : { kind: 'account.created', tx_hash: tx, account: who });
        if (c === 'ACCOUNT' && r === 'MERGE') out.push({ kind: 'account.removed', tx_hash: tx, account: who });
        if (c === 'TRUSTLINE' && (r === 'ADD' || r === 'REMOVE'))
          out.push({ kind: r === 'ADD' ? 'trustline.added' : 'trustline.removed', tx_hash: tx, account: who, ...(s.liquidity_pool_id ? { pool: s.liquidity_pool_id } : { asset_contract: address(s.token_id) }) });
      }
      return present(out);
    }
    case 'addresses.valid': {
      // every address wallet-backend stored, from every address column of this session's rows
      const out = new Set();
      const add = (v) => { const a = address(v); if (a) out.add(a); };
      for (const r of D.transactions_accounts) add(r.account_id);
      for (const r of D.operations_accounts) add(r.account_id);
      for (const s of D.state_changes) for (const c of ['account_id', 'signer_account_id', 'spender_account_id', 'creator_account_id', 'destination_account_id', 'token_id']) add(s[c]);
      for (const r of D.native_balances) add(r.account_id);
      for (const r of D.trustline_balances) { add(r.account_id); add(r.issuer); }
      for (const r of D.liquidity_pool_balances) add(r.account_id);
      for (const r of D.sac_balances) { add(r.account_id); add(r.contract_id); }
      return present([...out].sort());
    }
    default: return unsupported(`no ${p.kind} in wallet-backend's model`);
  }
}

const answers = req.probes.map((p) => {
  try { return { id: p.id, ...answer(p) }; } catch (e) { return { id: p.id, status: 'error', value: String(e.message ?? e) }; }
});
const tables = Object.fromEntries(Object.entries(D).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
process.stdout.write(JSON.stringify({ cursor: D.cursor, answers, tables }) + '\n');
