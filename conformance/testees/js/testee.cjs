// XDRProof conformance testee (prototype) for @stellar/stellar-sdk v17.x.
// usage: node testee.cjs <dir containing node_modules>.  Line-delimited JSON on stdin/stdout.
const dir = require('path').resolve(process.argv[2]);
const sdk = require(dir + '/node_modules/@stellar/stellar-sdk');
const pkg = require(dir + '/node_modules/@stellar/stellar-sdk/package.json');
const { xdr, Asset, Account, MuxedAccount, Operation, scValToNative } = sdk;
const canon = (v) => {            // typed, lossless rendering of JS natives
  if (typeof v === 'bigint') return { $bigint: v.toString() };
  if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString('hex') };
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return { $object: Object.entries(v).map(([k, x]) => [k, canon(x)]) };
  return v === undefined ? null : v;
};
const ops = {
  hello: () => ({ protocol: 0, implementation: { sdk: 'js', package: pkg.name, version: pkg.version, runtime: 'node ' + process.version },
    ops: Object.keys(ops), limits: { depth: 1500 } }),
  decode: ({ type, xdr: b64 }) => {
    const T = xdr[type]; if (!T) return { status: 'unsupported', reason: 'unknown type' };
    let v; try { v = T.fromXdr(b64, 'base64'); } catch (e) { return { status: 'error', error: { stage: 'decode', message: String(e.message) } }; }
    return { xdr: Buffer.from(v.toXdr()).toString('base64'), json: typeof v.toJson === 'function' ? v.toJson() : undefined };
  },
  asset_compare: ({ a, b }) => ({ value: Asset.compare(Asset.fromOperation(xdr.Asset.fromXdr(a, 'base64')), Asset.fromOperation(xdr.Asset.fromXdr(b, 'base64'))) }),
  operation_decode: ({ xdr: b64 }) => { const op = Operation.fromXdrObject(xdr.Operation.fromXdr(b64, 'base64')); return { value: { type: op.type } }; },
  scval_to_native: ({ xdr: b64 }) => ({ value: canon(scValToNative(xdr.ScVal.fromXdr(b64, 'base64'))) }),
  muxed_new: ({ account, id }) => { const m = new MuxedAccount(new Account(account, '1'), id); return { value: { id: m.id(), address: m.accountId() } }; },
  manage_sell_offer: ({ offerId, offerIdIsNumber }) => {
    const op = Operation.manageSellOffer({ selling: Asset.native(), buying: new Asset('ARST', 'GA5DUOR2HI5DUOR2HI5DUOR2HI5DUOR2HI5DUOR2HI5DUOR2HI5DVTUJ'), amount: '1', price: '1', offerId: offerIdIsNumber ? Number(offerId) : offerId });
    const raw = Buffer.from(op.toXdr()); return { value: { offerId: raw.readBigInt64BE(raw.length - 8).toString() } };
  },
};
require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line); let resp;
  try { resp = ops[req.op] ? ops[req.op](req.input || {}) : { status: 'unsupported' }; }
  catch (e) { resp = { status: 'error', error: { stage: 'api', message: String(e && e.message || e).slice(0, 200) } }; }
  process.stdout.write(JSON.stringify({ id: req.id, status: 'ok', ...resp }) + '\n');
});
