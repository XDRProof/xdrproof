// Minimal mock stellar-rpc for replay experiments. No dependencies.
// usage: node mock-rpc.mjs <dir-with-<seq>.lcm.xdr> <port> <request-log.jsonl>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [dir, port = '18545', logFile = 'requests.jsonl'] = process.argv.slice(2);
const ledgers = new Map();
for (const f of fs.readdirSync(dir)) {
  const m = f.match(/^(\d+)\.lcm\.xdr$/);
  if (m) ledgers.set(Number(m[1]), fs.readFileSync(path.join(dir, f)));
}
const seqs = [...ledgers.keys()].sort((a, b) => a - b);
const oldest = seqs[0], latest = seqs[seqs.length - 1];
const log = (o) => fs.appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
const PASS = process.env.PASSPHRASE || 'Test SDF Network ; September 2015';
const methods = {
  getHealth: () => ({ status: 'healthy', latestLedger: latest, oldestLedger: oldest, ledgerRetentionWindow: 120960 }),
  getNetwork: () => ({ passphrase: PASS, protocolVersion: 28, friendbotUrl: '' }),
  getLatestLedger: () => ({ id: '00'.repeat(32), protocolVersion: 28, sequence: latest }),
  getVersionInfo: () => ({ version: 'xdrproof-mock', commitHash: '', buildTimestamp: '', captiveCoreVersion: '', protocolVersion: 28 }),
  getLedgers: (p = {}) => {
    const limit = p.pagination?.limit ?? 50;
    const start = p.pagination?.cursor ? Number(p.pagination.cursor) + 1 : p.startLedger;
    if (start < oldest || start > latest) throw { code: -32600, message: `start ledger must be between the oldest ledger: ${oldest} and the latest ledger: ${latest} for this rpc instance` };
    const out = [];
    for (let s = start; s <= latest && out.length < limit; s++) {
      const b = ledgers.get(s); if (!b) break;
      out.push({ hash: '00'.repeat(32), sequence: s, ledgerCloseTime: '0', headerXdr: '', metadataXdr: b.toString('base64') });
    }
    return { ledgers: out, latestLedger: latest, latestLedgerCloseTime: 0, oldestLedger: oldest, oldestLedgerCloseTime: 0, cursor: String(out.length ? out[out.length - 1].sequence : start) };
  },
};
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method !== 'POST') { log({ http: req.method, url: req.url }); res.writeHead(404); return res.end('not found'); }
    let j; try { j = JSON.parse(body); } catch { res.writeHead(400); return res.end(); }
    log({ rpc: j.method, params: j.params });
    res.writeHead(200, { 'content-type': 'application/json' });
    try {
      if (!methods[j.method]) throw { code: -32601, message: 'method not found' };
      res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result: methods[j.method](j.params) }));
    } catch (e) { res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, error: e.code ? e : { code: -32603, message: String(e) } })); }
  });
}).listen(Number(port), '0.0.0.0', () => console.log(`mock rpc on :${port} ledgers ${oldest}..${latest} (${seqs.length})`));
