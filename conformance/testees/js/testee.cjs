// XDRProof conformance testee (protocol 1) for @stellar/stellar-sdk 17.x. See conformance/README.md.
// usage: node testee.cjs <dir containing node_modules>.  Line-delimited JSON on stdin/stdout.
const dir = require('path').resolve(process.argv[2]);
const sdk = require(dir + '/node_modules/@stellar/stellar-sdk');
const pkg = require(dir + '/node_modules/@stellar/stellar-sdk/package.json');
const { xdr, Asset, Account, MuxedAccount, Operation, StrKey, scValToNative } = sdk;
const canon = (v) => { // typed, lossless rendering of JS natives
  if (typeof v === 'bigint') return { $bigint: v.toString() };
  if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString('hex') };
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return { $object: Object.entries(v).map(([k, x]) => [k, canon(x)]) };
  return v === undefined ? null : v;
};
const type = (name) => xdr[name];
const err = (stage, e) => ({ status: 'error', error: { stage, message: String(e && e.message || e).slice(0, 300) } });
// one StrKey decoder per first letter (SEP-0023 version bytes)
const STRKEY = { G: 'decodeEd25519PublicKey', S: 'decodeEd25519SecretSeed', M: 'decodeMed25519PublicKey', T: 'decodePreAuthTx', X: 'decodeSha256Hash',
  P: 'decodeSignedPayload', C: 'decodeContract', W: 'decodeMuxedContract', L: 'decodeLiquidityPool', B: 'decodeClaimableBalance' };
const ops = {
  hello: () => ({ protocol: 1, implementation: { sdk: 'js', package: pkg.name, version: pkg.version, runtime: 'node ' + process.version }, ops: Object.keys(ops) }),
  decode: ({ type: name, xdr: b64 }) => {
    const T = type(name); if (!T) return { status: 'unsupported', reason: `no xdr.${name}` };
    let v; try { v = (T.fromXDR ?? T.fromXdr).call(T, b64, 'base64'); } catch (e) { return err('decode', e); }
    let out; try { out = Buffer.from((v.toXDR ?? v.toXdr).call(v)).toString('base64'); } catch (e) { return err('encode', e); }
    let json; try { json = typeof v.toJson === 'function' ? v.toJson() : undefined; } catch (e) { return { xdr: out, json_error: String(e.message).slice(0, 300) }; }
    return { xdr: out, json };
  },
  encode_json: ({ type: name, json }) => {
    const T = type(name); if (!T || typeof T.fromJson !== 'function') return { status: 'unsupported', reason: 'no fromJson' };
    try { const v = T.fromJson(json); return { xdr: Buffer.from(v.toXDR()).toString('base64') }; } catch (e) { return err('encode', e); }
  },
  strkey_decode: ({ strkey }) => {
    const f = STRKEY[strkey[0]]; if (!f || typeof StrKey[f] !== 'function') return { status: 'unsupported', reason: `no StrKey.${f ?? strkey[0]}` };
    try { return { kind: strkey[0], payload: Buffer.from(StrKey[f](strkey)).toString('hex') }; } catch (e) { return err('decode', e); }
  },
  native: ({ xdr: b64 }) => ({ value: canon(scValToNative(xdr.ScVal.fromXDR(b64, 'base64'))) }),
  // sighting ops (vectors/sightings.json)
  asset_compare: ({ a, b }) => ({ value: Asset.compare(Asset.fromOperation(xdr.Asset.fromXDR(a, 'base64')), Asset.fromOperation(xdr.Asset.fromXDR(b, 'base64'))) }),
  operation_decode: ({ xdr: b64 }) => { const op = Operation.fromXDRObject(xdr.Operation.fromXDR(b64, 'base64')); return { value: { type: op.type } }; },
  scval_to_native: ({ xdr: b64 }) => ({ value: canon(scValToNative(xdr.ScVal.fromXDR(b64, 'base64'))) }),
  muxed_new: ({ account, id }) => { const m = new MuxedAccount(new Account(account, '1'), id); return { value: { id: m.id(), address: m.accountId() } }; },
  manage_sell_offer: ({ offerId, offerIdIsNumber }) => {
    const op = Operation.manageSellOffer({ selling: Asset.native(), buying: new Asset('ARST', 'GA5DUOR2HI5DUOR2HI5DUOR2HI5DUOR2HI5DUOR2HI5DUOR2HI5DVTUJ'), amount: '1', price: '1', offerId: offerIdIsNumber ? Number(offerId) : offerId });
    const raw = Buffer.from(op.toXDR()); return { value: { offerId: raw.readBigInt64BE(raw.length - 8).toString() } };
  },
};
require('readline').createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line); let resp;
  try { resp = ops[req.op] ? ops[req.op](req.input || {}) : { status: 'unsupported', reason: 'unknown op' }; }
  catch (e) { resp = err('api', e); }
  process.stdout.write(JSON.stringify({ id: req.id, status: 'ok', ...resp }) + '\n');
});
