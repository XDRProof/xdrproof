// Reproduces js-stellar-sdk #1766, #1789, #1785 against one installed version.
// usage: node repro-sightings.cjs ./js-17.2.0
const dir = process.argv[2];
const sdk = require(dir + '/node_modules/@stellar/stellar-sdk');
const ver = require(dir + '/node_modules/@stellar/stellar-sdk/package.json').version;
const { xdr, Asset, StrKey, scValToNative, MuxedAccount, Account, Operation,
        LiquidityPoolAsset, LiquidityPoolFeeV18, getLiquidityPoolId } = sdk;
const out = (id, r) => console.log(JSON.stringify({ sdk: 'js', version: ver, id, ...r }));
const tryIt = (f) => { try { return { ok: true, value: f() } } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 160) } } };
const j = (v) => JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x));

// ---- #1766: issuer ordering -------------------------------------------------
const low = StrKey.encodeEd25519PublicKey(new Uint8Array(32));              // GAAA...
const high = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(0x3a));  // GA5D...
out('1766/strkeys', { low, high, textOrderSaysHighFirst: high < low });
out('1766/Asset.compare(low,high)', tryIt(() => Asset.compare(new Asset('ARST', low), new Asset('ARST', high))));
out('1766/new LiquidityPoolAsset(low,high)', tryIt(() => new LiquidityPoolAsset(new Asset('ARST', low), new Asset('ARST', high), LiquidityPoolFeeV18).toString()));
out('1766/getLiquidityPoolId(low,high)', tryIt(() => Buffer.from(getLiquidityPoolId('constant_product', { assetA: new Asset('ARST', low), assetB: new Asset('ARST', high), fee: LiquidityPoolFeeV18 })).toString('hex')));
// decode path: a ChangeTrust op whose pool params are in XDR-byte order (what core accepts).
// The bytes are fixed and SDK-independent: built by hand below from the XDR definition.
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const code4 = Buffer.from('ARST');
const alphanum4 = (keyByte) => Buffer.concat([u32(1), code4, u32(0), Buffer.alloc(32, keyByte)]);
const opBytes = Buffer.concat([
  u32(0),                // Operation.sourceAccount: absent
  u32(6),                // OperationType CHANGE_TRUST
  u32(3),                // ChangeTrustAsset: ASSET_TYPE_POOL_SHARE
  u32(0),                // LiquidityPoolParameters: LIQUIDITY_POOL_CONSTANT_PRODUCT
  alphanum4(0x00), alphanum4(0x3a),
  u32(30),               // fee
  Buffer.from('00000000000003e8', 'hex'), // limit 1000
]);
out('1766/op_xdr_b64', { value: opBytes.toString('base64') });
out('1766/Operation.fromXdrObject(poolShareChangeTrust)', tryIt(() => {
  const op = Operation.fromXdrObject(xdr.Operation.fromXdr(opBytes));
  return { type: op.type, line: String(op.line), limit: op.limit };
}));
out('1766/raw-xdr-roundtrip', tryIt(() => Buffer.from(xdr.Operation.fromXdr(opBytes).toXdr()).equals(opBytes)));

// ---- #1789: colliding map keys ----------------------------------------------
const map = xdr.ScVal.scvMap([
  new xdr.ScMapEntry({ key: xdr.ScVal.scvU32(1), val: xdr.ScVal.scvU32(10) }),
  new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('1'), val: xdr.ScVal.scvU32(20) }),
]);
const mapB64 = Buffer.from(map.toXdr()).toString('base64');
out('1789/scval_xdr_b64', { value: mapB64 });
out('1789/raw-decode-entry-count', tryIt(() => xdr.ScVal.fromXdr(mapB64, 'base64').value.length));
out('1789/scValToNative(map)', tryIt(() => j(scValToNative(xdr.ScVal.fromXdr(mapB64, 'base64')))));

// ---- #1785: non-canonical muxed / offer ids -----------------------------------
const base = new Account(low, '1');
for (const id of ['16', '0x10', '016', ' 16 ', '']) {
  out(`1785/MuxedAccount(id=${JSON.stringify(id)})`, tryIt(() => { const m = new MuxedAccount(base, id); return { idReported: m.id(), address: m.accountId() }; }));
}
const offer = (offerId) => tryIt(() => {
  const op = Operation.manageSellOffer({ selling: Asset.native(), buying: new Asset('ARST', high), amount: '1', price: '1', offerId });
  const raw = Buffer.from(op.toXdr());
  // offerId is the last 8 bytes of ManageSellOfferOp
  return { encodedOfferId: raw.readBigInt64BE(raw.length - 8).toString() };
});
out('1785/manageSellOffer(offerId=9007199254740993 as number)', offer(9007199254740993));
out('1785/manageSellOffer(offerId="9007199254740993")', offer('9007199254740993'));
out('1785/manageSellOffer(offerId="")', offer(''));
out('1785/manageSellOffer(offerId="-1")', offer('-1'));
out('1785/manageSellOffer(offerId="0x10")', offer('0x10'));
