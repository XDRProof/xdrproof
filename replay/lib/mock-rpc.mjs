// mock-rpc.mjs: a stellar-rpc that serves one session's corpus ledgers, offline. Its answers follow
// stellar-rpc v30.0.1 and the response types in go-stellar-sdk v0.9.0 protocols/rpc: every field comes
// from the ledgers themselves (hash, header, close time, protocol, the entries they leave behind), and the
// validation errors use stellar-rpc's own text. What it cannot answer from the corpus it refuses and
// records, so a verdict never rests on an answer the mock made up.
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = join(dirname(fileURLToPath(import.meta.url)), '../../tools/native/target/release/xdrproof-native');
const MAX_LIMIT = 200, DEFAULT_LIMIT = 50;          // stellar-rpc max-ledgers-limit / default-ledgers-limit
const RETENTION = 120960;                           // stellar-rpc history-retention-window default (7 days)
const INVALID_REQUEST = -32600, NOT_FOUND = -32601, INVALID_PARAMS = -32602;

const native = (reqs) => execFileSync(NATIVE, { input: reqs.map((r) => JSON.stringify(r)).join('\n') + '\n', maxBuffer: 2 ** 31 })
  .toString().trim().split('\n').map((l) => JSON.parse(l));

// session: { ledgers: [{ seq, bytes, hash, closeTime, headerXdr (Buffer), state?: {entries, removed} }], passphrase, protocol }
// (state is what derive.mjs ledgerEntries returns; computed here when absent)
export function startMockRpc(session, { host = '0.0.0.0' } = {}) {
  const ledgers = [...session.ledgers].sort((a, b) => a.seq - b.seq);
  const bySeq = new Map(ledgers.map((l) => [l.seq, l]));
  const first = ledgers[0], last = ledgers[ledgers.length - 1];
  for (let s = first.seq; s <= last.seq; s++) if (!bySeq.has(s)) throw new Error(`session ledgers are not contiguous: ${s} missing`);

  // getLedgerEntries answers from the state the session's ledgers leave behind, in order.
  const entries = new Map(), removed = new Set();
  for (const l of ledgers) {
    let r = l.state;
    if (!r) {
      [r] = native([{ id: 'e', op: 'ledger_entries', xdr: l.bytes.toString('base64') }]);
      if (r.status !== 'ok') throw new Error(`ledger_entries failed for ${l.seq}: ${r.message}`);
    }
    for (const k of r.removed) { entries.delete(k); removed.add(k); }
    for (const e of r.entries) { removed.delete(e.key); entries.set(e.key, e); }
  }

  const log = [];
  // unserved: methods and HTTP requests refused; unknownKeys: entries the corpus does not hold (answered not
  // found); ttlUnknown: contract entries served without liveUntilLedgerSeq because the ledger left their TTL
  // untouched. Each is a place where the mock knows less than stellar-rpc, reported with the session's verdict.
  const stats = { delivered: new Set(), byMethod: {}, unserved: new Set(), unknownKeys: new Set(), ttlUnknown: new Set(), firstRequestAt: null };
  const closeTime = (l) => l.closeTime;

  const ledgerInfo = (l, format) => {
    const info = { hash: l.hash, sequence: l.seq, ledgerCloseTime: String(closeTime(l)) };
    if (format === 'json') {
      const [h, m] = native([{ id: 'h', type: 'LedgerHeaderHistoryEntry', xdr: l.headerXdr.toString('base64') }, { id: 'm', type: 'LedgerCloseMeta', xdr: l.bytes.toString('base64') }]);
      info.headerJson = h.json; info.metadataJson = m.json;
    } else {
      info.headerXdr = l.headerXdr.toString('base64');
      info.metadataXdr = l.bytes.toString('base64');
    }
    return info;
  };
  const rpcError = (code, message) => Object.assign(new Error(message), { rpc: { code, message } });

  const methods = {
    getHealth: () => ({
      status: 'healthy', latestLedger: last.seq, latestLedgerCloseTime: String(closeTime(last)),
      oldestLedger: first.seq, oldestLedgerCloseTime: String(closeTime(first)), ledgerRetentionWindow: RETENTION,
    }),
    getNetwork: () => ({ passphrase: session.passphrase, protocolVersion: session.protocol }),
    getVersionInfo: () => ({ version: 'xdrproof-mock', commitHash: '', buildTimestamp: '', captiveCoreVersion: '', protocolVersion: session.protocol }),
    getLatestLedger: () => ({
      id: last.hash, protocolVersion: session.protocol, sequence: last.seq, closeTime: String(closeTime(last)),
      headerXdr: last.headerXdr.toString('base64'), metadataXdr: last.bytes.toString('base64'),
    }),
    // stellar-rpc v30.0.1 methods/get_ledgers.go and go-stellar-sdk protocols/rpc ValidatePagination
    getLedgers: (p = {}) => {
      const startLedger = p.startLedger ?? 0, pg = p.pagination, cursor = pg?.cursor ?? '';
      const badPage = `start ledger (${startLedger}) must be between the oldest ledger: ${first.seq} and the latest ledger: ${last.seq} for this rpc instance`;
      const inRange = (s) => s >= first.seq && s <= last.seq;
      if (pg) {
        if (cursor !== '') { if (startLedger !== 0) throw rpcError(INVALID_REQUEST, `startLedger (${startLedger}) and cursor (${cursor}) cannot both be set`); }
        else if (!inRange(startLedger)) throw rpcError(INVALID_REQUEST, badPage);
        if ((pg.limit ?? 0) > MAX_LIMIT) throw rpcError(INVALID_REQUEST, `limit must not exceed ${MAX_LIMIT}`);
      } else if (!inRange(startLedger)) throw rpcError(INVALID_REQUEST, badPage);
      let start = startLedger;
      if (cursor !== '') {
        if (!/^\d+$/.test(cursor)) throw rpcError(INVALID_PARAMS, `invalid cursor: ${cursor}`);
        start = Number(cursor) + 1;
        if (start < first.seq) throw rpcError(INVALID_PARAMS, `cursor ('${cursor}') must be at or above the oldest ledger: ${first.seq} for this rpc instance`);
      }
      const page = { latestLedger: last.seq, latestLedgerCloseTime: closeTime(last), oldestLedger: first.seq, oldestLedgerCloseTime: closeTime(first) };
      if (cursor !== '' && start > last.seq) return { ledgers: [], ...page, cursor }; // a caught-up poller's cursor is echoed back
      const limit = pg?.limit > 0 ? pg.limit : DEFAULT_LIMIT, out = [];
      for (let s = start; s <= Math.min(last.seq, start + limit - 1); s++) { out.push(ledgerInfo(bySeq.get(s), p.xdrFormat)); stats.delivered.add(s); }
      return { ledgers: out, ...page, cursor: String(out.length ? out[out.length - 1].sequence : cursor !== '' ? cursor : start - 1) };
    },
    getLedgerEntries: (p = {}) => {
      if (!Array.isArray(p.keys) || p.keys.length === 0) throw rpcError(INVALID_PARAMS, 'key list must be non-empty');
      const out = [];
      for (const k of p.keys) {
        const e = entries.get(k);
        if (!e) { if (!removed.has(k)) stats.unknownKeys.add(k); continue; } // gone, or never in the corpus (recorded)
        const r = { key: k, lastModifiedLedgerSeq: e.last_modified };
        if (p.xdrFormat === 'json') {
          const [kj, dj, xj] = native([{ id: 'k', type: 'LedgerKey', xdr: k }, { id: 'd', type: 'LedgerEntryData', xdr: e.xdr }, { id: 'x', type: 'LedgerEntryExt', xdr: e.ext }]);
          Object.assign(r, { keyJson: kj.json, dataJson: dj.json, extJson: xj.json });
        } else Object.assign(r, { xdr: e.xdr, extXdr: e.ext });
        if (e.live_until !== undefined) r.liveUntilLedgerSeq = e.live_until;
        else if ([6, 7].includes(Buffer.from(k, 'base64').readInt32BE(0))) stats.ttlUnknown.add(k); // CONTRACT_DATA, CONTRACT_CODE
        out.push(r);
      }
      return { entries: out, latestLedger: last.seq };
    },
  };

  const answer = (j) => {
    const m = j?.method;
    stats.byMethod[m] = (stats.byMethod[m] ?? 0) + 1;
    const entry = { t: Date.now(), method: m };
    try {
      if (!methods[m]) {
        stats.unserved.add(m);
        throw rpcError(NOT_FOUND, `xdrproof mock: ${m} is not served; the corpus holds no data to answer it`);
      }
      const result = methods[m](j.params);
      if (m === 'getLedgers') entry.ledgers = result.ledgers.map((l) => l.sequence);
      log.push(entry);
      return { jsonrpc: '2.0', id: j.id, result };
    } catch (e) {
      entry.error = e.rpc ?? { code: -32603, message: String(e.message ?? e) };
      log.push(entry);
      return { jsonrpc: '2.0', id: j.id, error: entry.error };
    }
  };

  const server = http.createServer((req, res) => {
    stats.firstRequestAt ??= Date.now();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST') { // e.g. a history-archive fetch: refused, recorded
        log.push({ t: Date.now(), http: `${req.method} ${req.url}` }); stats.unserved.add(`HTTP ${req.method} ${req.url.split('?')[0]}`);
        res.writeHead(404); return res.end('not served by the xdrproof mock');
      }
      let j;
      try { j = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
      const out = Array.isArray(j) ? j.map(answer) : answer(j);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(0, host, () => resolve({
    port: server.address().port, log, stats, first: first.seq, last: last.seq,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  })));
}
