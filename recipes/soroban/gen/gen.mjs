// Offline deterministic Soroban recipe runner.
// Usage: node gen.mjs <core-http-url> <passphrase> <protocol> <manifest-out.json>
// No RPC and no simulation: footprints are computed from known contract behaviour,
// resources are fixed generous constants, sequence numbers follow from ledger numbers,
// keys come from fixed seeds, nonces are fixed, close times are explicit.
import * as S from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const { xdr } = S;
const [core, passphrase, protoArg, manifestPath] = process.argv.slice(2);
const PROTO = Number(protoArg);
const sha = (s) => createHash('sha256').update(s).digest();
const kp = (name) => S.Keypair.fromRawEd25519Seed(sha('xdrproof:' + name));
const root = S.Keypair.fromRawEd25519Seed(sha(passphrase));
const [alice, bob, carol, issuer] = ['alice', 'bob', 'carol', 'issuer'].map(kp);
const dave = kp('dave'); // never created classically: the XLM SAC transfer creates it (CAP-0073)
const T0 = 1767225600, STEP = 2592000;
const get = async (p) => (await fetch(core + '/' + p)).text();
const manifest = { passphrase, protocol: PROTO, steps: [], accounts: {}, contracts: {} };
for (const [n, k] of Object.entries({ root, alice, bob, carol, issuer, dave })) manifest.accounts[n] = k.publicKey();

let ledger = Number(process.env.START_LEDGER || 1); // >1 when settings-upgrade.sh already upgraded the network
const close = async () => { ledger++; const r = await get(`manualclose?ledgerSeq=${ledger}&closeTime=${T0 + ledger * STEP}`); if (!r.includes(`sequence number ${ledger} `)) throw new Error(r); };
const seq = new Map([[root.publicKey(), BigInt(process.env.ROOT_SEQ || 0)]]);
const TB = { minTime: 0, maxTime: 0 };
const submit = async (name, tx, note) => {
  const r = JSON.parse(await get('tx?blob=' + encodeURIComponent(tx.toEnvelope().toXDR('base64'))));
  const inner = tx.innerTransaction ?? tx; // a fee bump consumes the inner source's sequence number
  const src = inner.source.startsWith('M') ? S.MuxedAccount.fromAddress(inner.source, '0').baseAccount().accountId() : inner.source;
  if (r.status !== 'PENDING') { console.log(name, 'REJECTED', JSON.stringify(r)); manifest.steps.push({ name, rejected: r }); if (!process.env.PROBE) throw new Error(name + ': rejected at submission'); return false; }
  seq.set(src, seq.get(src) + 1n);
  await close();
  manifest.steps.push({ name, ledger, tx: Buffer.from(tx.hash()).toString('hex'), note });
  console.log(String(ledger).padStart(3), name, Buffer.from(tx.hash()).toString('hex'));
  return true;
};
const classic = (src, ops, signers = [src]) => {
  const b = new S.TransactionBuilder(new S.Account(src.publicKey(), seq.get(src.publicKey()).toString()), { fee: '1000', networkPassphrase: passphrase, timebounds: TB });
  ops.forEach((o) => b.addOperation(o)); const tx = b.build(); signers.forEach((s) => tx.sign(s)); return tx;
};
// ---- Soroban helpers -------------------------------------------------------
const RES = { ins: 20_000_000, read: 20_000, write: 20_000, fee: 100_000_000 }; // fixed, generous
const soroban = (src, op, { ro = [], rw = [], ...over } = {}, signers = [src]) => {
  const r = { ...RES, ...over };
  const data = new S.SorobanDataBuilder().setFootprint(ro, rw).setResources(r.ins, r.read, r.write).setResourceFee(r.fee).build();
  const tx = new S.TransactionBuilder(new S.Account(src.publicKey(), seq.get(src.publicKey()).toString()), { fee: String(1000 + r.fee), networkPassphrase: passphrase, timebounds: TB })
    .addOperation(op).setSorobanData(data).build();
  signers.forEach((s) => tx.sign(s)); return tx;
};
const en = (v) => (typeof v === 'function' ? v() : v);
const DUR = { persistent: en(xdr.ContractDataDurability.persistent), temporary: en(xdr.ContractDataDurability.temporary) };
const addr = (s) => new S.Address(s).toScAddress();
const kAccount = (k) => xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: k.xdrAccountId() }));
const kTrust = (k, asset) => xdr.LedgerKey.trustline(new xdr.LedgerKeyTrustLine({ accountId: k.xdrAccountId(), asset: asset.toTrustLineXDRObject() }));
const kCode = (hash) => xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash }));
const kData = (contract, key, durability = DUR.persistent) =>
  xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: typeof contract === 'string' ? addr(contract) : contract, key, durability }));
const kInstance = (c) => kData(c, xdr.ScVal.scvLedgerKeyContractInstance());
const kNonce = (k, nonce) => kData(addr(k.publicKey()), xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({ nonce: xdr.Int64.fromString(String(nonce)) })), DUR.temporary);
const networkId = sha(passphrase);
const contractId = (preimage) => S.StrKey.encodeContract(sha(xdr.HashIdPreimage.envelopeTypeContractId(new xdr.HashIdPreimageContractId({ networkId, contractIdPreimage: preimage })).toXDR()));
const fnInv = (contract, fn, args, subs = []) => new xdr.SorobanAuthorizedInvocation({
  function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({ contractAddress: addr(contract), functionName: fn, args })), subInvocations: subs });
const srcAuth = (rootInvocation) => new xdr.SorobanAuthorizationEntry({ credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(), rootInvocation });
const EXPIRES = 100000; // signatureExpirationLedger, fixed
const addrAuth = (signer, nonce, rootInvocation, v2 = false) => S.authorizeEntry(new xdr.SorobanAuthorizationEntry({
  credentials: xdr.SorobanCredentials[v2 ? 'sorobanCredentialsAddressV2' : 'sorobanCredentialsAddress'](new xdr.SorobanAddressCredentials({ address: addr(signer.publicKey()), nonce: xdr.Int64.fromString(String(nonce)), signatureExpirationLedger: EXPIRES, signature: xdr.ScVal.scvVoid() })),
  rootInvocation }), signer, EXPIRES, passphrase);
const invoke = (contract, fn, args, auth = []) => S.Operation.invokeContractFunction({ contract, function: fn, args, auth });
const i128 = (n) => S.nativeToScVal(BigInt(n), { type: 'i128' });
const A = (s) => new S.Address(s).toScVal();
const sym = (s) => xdr.ScVal.scvSymbol(s);

// ---- ledger 2: protocol upgrade (never a corpus entry) -----------------------
if (ledger === 1) { console.log((await get(`upgrades?mode=set&upgradetime=1970-01-01T00:00:00Z&protocolversion=${PROTO}&basereserve=5000000`)).trim());
  await close(); }
const info = JSON.parse(await get('info')).info.ledger; if (info.version !== PROTO) throw new Error('protocol is ' + info.version);

// ---- classic setup -----------------------------------------------------------
await submit('setup-create-accounts', classic(root, [alice, bob, carol, issuer].map((k) => S.Operation.createAccount({ destination: k.publicKey(), startingBalance: '10000' }))));
for (const k of [alice, bob, carol, issuer]) seq.set(k.publicKey(), BigInt(ledger) << 32n);

// ---- (a) SAC deploy for a classic asset, then SAC trust() --------------------
const XPF = new S.Asset('XPF', issuer.publicKey());
const sac = XPF.contractId(passphrase); manifest.contracts.sac_XPF = sac;
await submit('sac-deploy-classic-asset', soroban(alice, S.Operation.createStellarAssetContract({ asset: XPF }), { rw: [kInstance(sac)] }),
  'CreateContract from_asset XPF:issuer');
// bob is tx source and trustor: source-account credentials
await submit('sac-trust-source-auth', soroban(bob, invoke(sac, 'trust', [A(bob.publicKey())], [srcAuth(fnInv(sac, 'trust', [A(bob.publicKey())]))]),
  { ro: [kInstance(sac), kAccount(issuer)], rw: [kAccount(bob), kTrust(bob, XPF)] }),
  'CAP-0073 trust(): trustline created by InvokeHostFunction, no contract event (wallet-backend#731)');
// alice submits, carol is trustor: address credentials with a fixed nonce
await submit('sac-trust-address-auth', soroban(alice, invoke(sac, 'trust', [A(carol.publicKey())], [await addrAuth(carol, 7310001, fnInv(sac, 'trust', [A(carol.publicKey())]))]),
  { ro: [kInstance(sac), kAccount(issuer)], rw: [kAccount(carol), kTrust(carol, XPF), kNonce(carol, 7310001)] }),
  'CAP-0073 trust() where trustor != tx source (address credentials)');
// trust() again for an existing trustline: no-op, no auth needed
await submit('sac-trust-noop-existing', soroban(alice, invoke(sac, 'trust', [A(bob.publicKey())]),
  { ro: [kInstance(sac), kAccount(issuer), kAccount(bob), kTrust(bob, XPF)] }), 'CAP-0073 trust() on an existing trustline: success with no ledger change');
// SAC mint into the SAC-created trustline (issuer is admin), so the trustline carries a balance
await submit('sac-mint-to-sac-trustline', soroban(issuer, invoke(sac, 'mint', [A(bob.publicKey()), i128(1234567)], [srcAuth(fnInv(sac, 'mint', [A(bob.publicKey()), i128(1234567)]))]),
  { ro: [kInstance(sac), kAccount(issuer)], rw: [kTrust(bob, XPF)] }), 'mint to the trustline created by trust()');

// ---- (e) CAP-0073 / CAP-0067 / CAP-0084 via the native SAC ------------------
const xlm = S.Asset.native().contractId(passphrase); manifest.contracts.sac_native = xlm;
await submit('sac-deploy-native', soroban(alice, S.Operation.createStellarAssetContract({ asset: S.Asset.native() }), { rw: [kInstance(xlm)] }));
{ const args = [A(alice.publicKey()), A(dave.publicKey()), i128(25_0000000)];
  await submit('xlm-sac-transfer-creates-account', soroban(alice, invoke(xlm, 'transfer', args, [srcAuth(fnInv(xlm, 'transfer', args))]),
    { ro: [kInstance(xlm)], rw: [kAccount(alice), kAccount(dave)] }), 'CAP-0073: XLM SAC transfer creates a G-account'); }
{ const m = new S.MuxedAccount(new S.Account(bob.publicKey(), '0'), '18446744073709551615').accountId();
  const to = xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeMuxedAccount(new xdr.MuxedEd25519Account({ id: xdr.Uint64.fromString('18446744073709551615'), ed25519: bob.rawPublicKey() })));
  const args = [A(alice.publicKey()), to, i128(1)];
  await submit('xlm-sac-transfer-muxed-dest', soroban(alice, invoke(xlm, 'transfer', args, [srcAuth(fnInv(xlm, 'transfer', args))]),
    { ro: [kInstance(xlm)], rw: [kAccount(alice), kAccount(bob)] }), `CAP-0067: transfer to ${m}; event data is a map with to_muxed_id = u64 max`); }

// ---- custom contract: upload + deploy ---------------------------------------
const wasm = readFileSync(new URL('../wasm/xdrproof_kit.wasm', import.meta.url));
const wasmHash = sha(wasm);
await submit('kit-upload-wasm', soroban(alice, S.Operation.uploadContractWasm({ wasm }), { rw: [kCode(wasmHash)] }));
const deployKit = async (i) => {
  const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(alice.publicKey()), salt: sha('xdrproof:kit:' + i) }));
  const id = contractId(preimage);
  const args = new xdr.CreateContractArgsV2({ contractIdPreimage: preimage, executable: xdr.ContractExecutable.contractExecutableWasm(wasmHash), constructorArgs: [] });
  const auth = srcAuth(new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(args), subInvocations: [] }));
  const op = S.Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeCreateContractV2(args), auth: [auth] });
  await submit('kit-deploy-' + i, soroban(alice, op, { ro: [kCode(wasmHash)], rw: [kInstance(id)] }));
  return id;
};
const DEPTH = Number(process.env.KIT_INSTANCES || 6);
const kits = []; for (let i = 0; i < DEPTH; i++) kits.push(await deployKit(i));
manifest.contracts.kit = kits; manifest.contracts.kit_wasm_hash = wasmHash.toString('hex');
const K0 = kits[0];

// ---- (c) ScMap whose keys collide after native conversion (js-stellar-sdk#1789)
// Keys are distinct and sorted for the host: u32 1 < i32 1 < u64 1 < string "1" < symbol "1".
const entry = (key, n) => new xdr.ScMapEntry({ key, val: xdr.ScVal.scvU32(n) });
const collide = xdr.ScVal.scvMap([
  entry(xdr.ScVal.scvU32(1), 10), entry(xdr.ScVal.scvI32(1), 20), entry(xdr.ScVal.scvU64(xdr.Uint64.fromString('1')), 30),
  entry(xdr.ScVal.scvString('1'), 40), entry(sym('1'), 50)]);
await submit('map-colliding-keys-as-value', soroban(alice, invoke(K0, 'put', [sym('collide'), collide]),
  { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, sym('collide'))] }),
  'colliding map in: invoke args, contract data value, event data, return value');
await submit('map-colliding-keys-as-key', soroban(alice, invoke(K0, 'put', [collide, xdr.ScVal.scvU32(1789)]),
  { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, collide)] }),
  'colliding map in: invoke args, contract data KEY (LedgerKey), event topic');

// ---- (b) nested authorization tree ------------------------------------------
const nestTree = (signerAddr, chain) => { // chain[0].nest(a, chain[1..]) -> chain[1].nest(a, chain[2..]) -> ...
  const args = (i) => [A(signerAddr), xdr.ScVal.scvVec(chain.slice(i + 1).map(A))];
  let inv = null; for (let i = chain.length - 1; i >= 0; i--) inv = fnInv(chain[i], 'nest', args(i), inv ? [inv] : []);
  return { inv, args: args(0) };
};
{ const { inv, args } = nestTree(bob.publicKey(), kits);
  await submit('nested-auth-tree-depth-' + kits.length, soroban(alice, invoke(K0, 'nest', args, [await addrAuth(bob, 4611001, inv)]),
    { ro: [...kits.map(kInstance), kCode(wasmHash), kAccount(bob)], rw: [kNonce(bob, 4611001)] }),
    `address credentials, one root with a ${kits.length}-deep chain of sub-invocations`); }


// Authorization tree deeper than the call tree. K0.nest(alice, []) is the only real call; the
// root invocation carries a single chain of never-called sub-invocations. Measured on core
// v30.0.0: 245 nodes deep applies, 246 fails with INVOKE_HOST_FUNCTION_TRAPPED.
const deepTree = (D) => { const args = [A(alice.publicKey()), xdr.ScVal.scvVec([])];
  let inv = null; for (let i = 0; i < D - 1; i++) inv = fnInv(kits[1], 'nest', args, inv ? [inv] : []);
  return soroban(alice, invoke(K0, 'nest', args, [srcAuth(fnInv(K0, 'nest', args, inv ? [inv] : []))]), { ro: [kInstance(K0), kCode(wasmHash)] }); };
await submit('auth-tree-depth-245-max', deepTree(245), 'deepest authorization tree core applies (245 nodes in one chain, 244 never called)');
await submit('auth-tree-depth-246-trapped', deepTree(246), 'one deeper: tx is included and fails, invoke_host_function = trapped');

// ---- (e) CAP-0071-02 (P27): SOROBAN_CREDENTIALS_ADDRESS_V2 ------------------
{ const args = [A(bob.publicKey()), xdr.ScVal.scvVec([])];
  await submit('address-v2-credentials', soroban(alice, invoke(K0, 'nest', args, [await addrAuth(bob, 7102001, fnInv(K0, 'nest', args), true)]),
    { ro: [kInstance(K0), kCode(wasmHash), kAccount(bob)], rw: [kNonce(bob, 7102001)] }), 'CAP-0071-02: address credentials V2 (signature payload bound to the address)'); }

// ---- (d) vectors at their XDR maximum ---------------------------------------
// AccountEntry.signers<20> and TransactionEnvelope.signatures<20> on a Soroban transaction;
// SCSymbol<32> at 32 bytes as data key, topic and argument.
const extra = Array.from({ length: 20 }, (_, i) => kp('carol-signer-' + i));
await submit('setup-20-signers', classic(carol, [...extra.map((k) => S.Operation.setOptions({ signer: { ed25519PublicKey: k.publicKey(), weight: 1 } })), S.Operation.setOptions({ lowThreshold: 20, medThreshold: 20, highThreshold: 20 })]),
  'classic: AccountEntry.signers at MAX_SIGNERS = 20, thresholds 20 so every signature is needed');
{ const s32 = sym('abcdefghijklmnopqrstuvwxyz_01234'); // 32 bytes = SCSYMBOL_LIMIT
  await submit('max-signatures-max-symbol', soroban(carol, invoke(K0, 'put', [s32, xdr.ScVal.scvVec([s32])]),
    { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, s32)] }, extra),
    'Soroban tx with signatures<20> full (20 extra signers, master not used) and a 32-byte symbol'); }

// ---- P30 only: CAP-0084 muxed contract address ------------------------------
if (PROTO >= 30) {
    const to = xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeMuxedContract(new xdr.MuxedContract({ id: xdr.Uint64.fromString('84'), contractId: addr(K0).contractId })));
  const args = [A(alice.publicKey()), to, i128(5_0000000)];
  const bal = kData(xlm, xdr.ScVal.scvVec([sym('Balance'), A(K0)]));
  await submit('xlm-sac-transfer-muxed-contract', soroban(alice, invoke(xlm, 'transfer', args, [srcAuth(fnInv(xlm, 'transfer', args))]),
    { ro: [kInstance(xlm)], rw: [kAccount(alice), bal] }), 'CAP-0084: transfer to SC_ADDRESS_TYPE_MUXED_CONTRACT');
}

// ---- every ScVal number and time type, plus TTL and restore operations (appended; earlier ledgers unchanged)
const u64 = (s) => xdr.Uint64.fromString(s), i64 = (s) => xdr.Int64.fromString(s), MAXU = '18446744073709551615', MINI = '-9223372036854775808';
const everyType = xdr.ScVal.scvVec([
  xdr.ScVal.scvI64(i64(MINI)),
  xdr.ScVal.scvU128(new xdr.Uint128Parts({ hi: u64(MAXU), lo: u64(MAXU) })),
  xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: i64(MINI), lo: u64('0') })),
  xdr.ScVal.scvU256(new xdr.Uint256Parts({ hiHi: u64(MAXU), hiLo: u64(MAXU), loHi: u64(MAXU), loLo: u64(MAXU) })),
  xdr.ScVal.scvI256(new xdr.Int256Parts({ hiHi: i64(MINI), hiLo: u64('0'), loHi: u64('0'), loLo: u64('0') })),
  xdr.ScVal.scvTimepoint(u64(MAXU)), xdr.ScVal.scvDuration(u64(MAXU)),
  xdr.ScVal.scvBytes(Buffer.alloc(64, 0xff)), xdr.ScVal.scvString(Buffer.from([0xff, 0xfe, 0x41])),
  xdr.ScVal.scvBool(true), xdr.ScVal.scvVoid()]);
await submit('scval-every-number-and-time-type', soroban(alice, invoke(K0, 'put', [sym('types'), everyType]),
  { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, sym('types'))] }),
  'i64 min, u128 max, i128 min, u256 max, i256 min, timepoint and duration max, 64 bytes, non-UTF-8 string, bool, void');
await submit('extend-footprint-ttl', soroban(alice, S.Operation.extendFootprintTtl({ extendTo: 50000 }), { ro: [kData(K0, sym('collide'))] }),
  'EXTEND_FOOTPRINT_TTL on contract data');
await submit('restore-footprint-live-entry', soroban(alice, S.Operation.restoreFootprint({}), { rw: [kData(K0, sym('collide'))] }),
  'RESTORE_FOOTPRINT on a live entry: success, nothing to restore');

// ---- blueprint placements B2b (appended; earlier ledgers unchanged) ----------
const TWO63 = '9223372036854775808', MAXI = '9223372036854775807';
const muxedAcct = (k, id) => xdr.MuxedAccount.keyTypeMuxedEd25519(new xdr.MuxedAccountMed25519({ id: u64(id), ed25519: k.rawPublicKey() }));
// The JS builder refuses a memo or a muxed source on every Soroban operation. stellar-core refuses them
// only on a single INVOKE_HOST_FUNCTION (TransactionFrame::validateSorobanMemo), so TTL and restore
// transactions with them are valid. Build unsigned, edit the envelope, then sign with the base key.
const byHand = (tx, edit, signers) => {
  const env = tx.toEnvelope(); edit(env.v1.tx);
  const t = new S.Transaction(env, passphrase); signers.forEach((s) => t.sign(s)); return t;
};
// H-A9 + wallet-backend#753: muxed tx source and a text memo on EXTEND_FOOTPRINT_TTL
await submit('ttl-extend-muxed-source-text-memo', byHand(soroban(alice, S.Operation.extendFootprintTtl({ extendTo: 60000 }), { ro: [kData(K0, sym('collide'))] }, []),
  (t) => { t.sourceAccount = muxedAcct(alice, '753'); t.memo = xdr.Memo.memoText('xdrproof ttl'); }, [alice]),
  'EXTEND_FOOTPRINT_TTL from M(alice, 753) with a text memo: valid in core, refused by the JS builder');
// ...and a muxed OPERATION source plus a text memo on RESTORE_FOOTPRINT
await submit('restore-muxed-op-source-text-memo', byHand(soroban(alice, S.Operation.restoreFootprint({}), { rw: [kData(K0, sym('types'))] }, []),
  (t) => { t.operations[0].sourceAccount = muxedAcct(alice, MAXU); t.memo = xdr.Memo.memoText('xdrproof restore'); }, [alice]),
  'RESTORE_FOOTPRINT whose operation source is M(alice, u64 max), with a text memo');

// H-C13 / H-A8: Soroban fee bump paid by a muxed fee source; the refund goes to the fee source
{ const args = [sym('feebump'), xdr.ScVal.scvU32(13)];
  const inner = soroban(alice, invoke(K0, 'put', args), { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, sym('feebump'))] });
  // soroban() bids 1000 + resource fee as its inclusion fee (the builder adds the resource fee on top),
  // and a fee bump must bid at least the inner per-operation inclusion fee
  const bid = (BigInt(inner.fee) - BigInt(RES.fee)).toString();
  const fb = S.TransactionBuilder.buildFeeBumpTransaction(new S.MuxedAccount(new S.Account(bob.publicKey(), '0'), '13').accountId(), bid, inner, passphrase);
  fb.sign(bob);
  await submit('soroban-fee-bump-muxed-fee-source', fb, 'fee bump of a Soroban call, fee source M(bob, 13); resource fee refunded to bob, not alice'); }

// H-A11: a muxed ScAddress inside a contract-data key is refused by the host (CAP-0067), so put traps.
// The same muxed address sits, valid, in the invoke arguments and in the footprint's ledger key.
{ const mkey = xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeMuxedAccount(new xdr.MuxedEd25519Account({ id: u64('42'), ed25519: bob.rawPublicKey() })));
  await submit('kit-put-muxed-address-key-trapped', soroban(alice, invoke(K0, 'put', [mkey, xdr.ScVal.scvU32(1)]),
    { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, mkey)] }),
    'put(M(bob, 42), 1): included, fails trapped; no contract data written'); }

// H-B4: integer boundaries where a reader that treats the low 64 bits as signed goes wrong
{ const I128 = (hi, lo) => xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: i64(hi), lo: u64(lo) }));
  const U128 = (hi, lo) => xdr.ScVal.scvU128(new xdr.Uint128Parts({ hi: u64(hi), lo: u64(lo) }));
  const I256 = (a, b, c, d) => xdr.ScVal.scvI256(new xdr.Int256Parts({ hiHi: i64(a), hiLo: u64(b), loHi: u64(c), loLo: u64(d) }));
  const U256 = (a, b, c, d) => xdr.ScVal.scvU256(new xdr.Uint256Parts({ hiHi: u64(a), hiLo: u64(b), loHi: u64(c), loLo: u64(d) }));
  const wide = xdr.ScVal.scvVec([
    xdr.ScVal.scvU32(4294967295), xdr.ScVal.scvI32(-2147483648), xdr.ScVal.scvI32(2147483647),
    xdr.ScVal.scvU64(u64(TWO63)), xdr.ScVal.scvI64(i64(MAXI)),
    I128('0', TWO63), I128('-1', TWO63), I128('-1', MAXU), I128(MAXI, MAXU),
    U128('0', TWO63), U128('1', '0'),
    I256(MAXI, MAXU, MAXU, MAXU), I256('-1', MAXU, MAXU, MAXU), I256('-1', MAXU, MAXU, TWO63),
    U256('0', '0', '0', TWO63), U256('0', '0', TWO63, '0'),
    xdr.ScVal.scvTimepoint(u64(TWO63)), xdr.ScVal.scvDuration(u64(TWO63))]);
  await submit('scval-wide-integer-boundaries', soroban(alice, invoke(K0, 'put', [sym('wide'), wide]),
    { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, sym('wide'))] }),
    'i128 2^63, -2^63, -1, max; u128 2^63, 2^64; i256 max, -1, -2^63; u256 2^63, 2^127; u32/i32/u64/i64 edges; timepoint and duration 2^63');
  // the same shape in a real token flow: a SAC balance held by a contract is an i128 with no int64 cap
  const amt = I128('1', TWO63); // 2^64 + 2^63 = 27670116110564327424 stroops of XPF
  const margs = [A(K0), amt];
  await submit('sac-mint-to-contract-beyond-int64', soroban(issuer, invoke(sac, 'mint', margs, [srcAuth(fnInv(sac, 'mint', margs))]),
    { ro: [kInstance(sac), kAccount(issuer)], rw: [kData(sac, xdr.ScVal.scvVec([sym('Balance'), A(K0)]))] }),
    'SAC mint of 2^64 + 2^63 XPF to a contract: balance entry and mint event carry an i128 above int64 max'); }

// H-B7 + wallet-backend#820: a contract deploy whose authorization tree is 245 invocations deep.
// The root is the deploy itself (executed); 244 nested nest() sub-invocations are never called.
{ const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(alice.publicKey()), salt: sha('xdrproof:kit:deep-deploy') }));
  const id = contractId(preimage);
  const cargs = new xdr.CreateContractArgsV2({ contractIdPreimage: preimage, executable: xdr.ContractExecutable.contractExecutableWasm(wasmHash), constructorArgs: [] });
  const nargs = [A(alice.publicKey()), xdr.ScVal.scvVec([])];
  const D = Number(process.env.DEPLOY_TREE || 245);
  let chain = null; for (let i = 0; i < D - 1; i++) chain = fnInv(kits[1], 'nest', nargs, chain ? [chain] : []);
  const root = new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(cargs), subInvocations: chain ? [chain] : [] });
  const op = S.Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeCreateContractV2(cargs), auth: [srcAuth(root)] });
  await submit('deploy-with-auth-tree-depth-' + D, soroban(alice, op, { ro: [kCode(wasmHash)], rw: [kInstance(id)] }),
    `CreateContractV2 whose source-credential auth root carries a ${D}-deep chain; a contract instance is created`);
  manifest.contracts.kit_deep_deploy = id; }

// H-A5 + wallet-backend#745: a liquidity-pool or claimable-balance ScAddress as the deployer.
// The host refuses both address kinds (CAP-0067), so at most a failed transaction can carry them.
for (const [kind, address] of [
  ['liquidity-pool', xdr.ScAddress.scAddressTypeLiquidityPool(new xdr.PoolId(sha('xdrproof:deployer:liquidity-pool')))],
  ['claimable-balance', xdr.ScAddress.scAddressTypeClaimableBalance(xdr.ClaimableBalanceId.claimableBalanceIdTypeV0(sha('xdrproof:deployer:claimable-balance')))]]) {
  const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address, salt: sha('xdrproof:salt:' + kind) }));
  const cargs = new xdr.CreateContractArgsV2({ contractIdPreimage: preimage, executable: xdr.ContractExecutable.contractExecutableWasm(wasmHash), constructorArgs: [] });
  await submit(`deploy-from-${kind}-address`, soroban(alice, S.Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeCreateContractV2(cargs), auth: [] }),
    { ro: [kCode(wasmHash)], rw: [kInstance(contractId(preimage))] }), `CreateContractV2 from a ${kind} ScAddress: included, refused by the host`);
}

// ---- H-C16: transactions valid at submission that fail at apply ----------------
// Core applies a ledger's classic phase before its Soroban phase, and re-checks the source account,
// sequence number, signatures and sequence-age preconditions at apply (TransactionFrame::commonValid,
// OperationFrame::checkSignature with forApply). So a classic "attacker" that changes an account
// makes a Soroban "victim" queued for the same ledger fail, in a fixed order. (Within one phase the
// order is a hash shuffle, TxSetFrame.cpp ApplyTxSorter, so classic-only pairs are not reproducible.)
const pending = [];
const enqueue = async (name, tx, note) => { // like submit(), but the ledger closes in closeGroup()
  const r = JSON.parse(await get('tx?blob=' + encodeURIComponent(tx.toEnvelope().toXDR('base64'))));
  if (r.status !== 'PENDING') { console.log(name, 'REJECTED', JSON.stringify(r)); manifest.steps.push({ name, rejected: r }); if (!process.env.PROBE) throw new Error(name + ': rejected at submission'); return false; }
  const inner = tx.innerTransaction ?? tx;
  const src = inner.source.startsWith('M') ? S.MuxedAccount.fromAddress(inner.source, '0').baseAccount().accountId() : inner.source;
  seq.set(src, seq.get(src) + 1n); // victims that fail txBAD_SEQ or txNO_ACCOUNT never use the next number; they are not reused
  pending.push({ name, tx: Buffer.from(tx.hash()).toString('hex'), note }); return true;
};
const closeGroup = async (group) => {
  await close();
  for (const p of pending.splice(0)) { manifest.steps.push({ ...p, ledger, group }); console.log(String(ledger).padStart(3), p.name, p.tx); }
};
{ const [x1, x2, x3, x4, vA, vB, vC, vD, vF, vG, y1, y2] = ['x1', 'x2', 'x3', 'x4', 'vA', 'vB', 'vC', 'vD', 'vF', 'vG', 'y1', 'y2'].map((n) => kp('race-' + n));
  const sC = kp('race-signer-C'), sD = kp('race-signer-D');
  await submit('race-setup-accounts', classic(root, [x1, x2, x3, x4, vA, vB, vC, vD, vF, vG, y1, y2].map((k) => S.Operation.createAccount({ destination: k.publicKey(), startingBalance: '1000' }))));
  for (const k of [x1, x2, x3, x4, vA, vB, vC, vD, vF, vG, y1, y2]) seq.set(k.publicKey(), BigInt(ledger) << 32n);
  for (const [v, s] of [[vC, sC], [vD, sD]]) // one extra signer, thresholds 1 so a signature is always needed
    await enqueue('race-setup-signer-' + (v === vC ? 'vC' : 'vD'), classic(v, [S.Operation.setOptions({ signer: { ed25519PublicKey: s.publicKey(), weight: 1 }, lowThreshold: 1, medThreshold: 1, highThreshold: 1 })]));
  await closeGroup('race-setup');

  const ttl = (source) => S.Operation.extendFootprintTtl({ extendTo: 60001, ...(source ? { source: source.publicKey() } : {}) });
  const fp = { ro: [kData(K0, sym('collide'))] };
  // classic phase: six attackers
  await enqueue('race-attacker-bump-sequence', classic(x1, [S.Operation.bumpSequence({ bumpTo: String((BigInt(ledger) << 32n) + 1000n), source: vA.publicKey() })], [x1, vA]), 'bumps vA past its queued transaction');
  await enqueue('race-attacker-merge-tx-source', classic(x2, [S.Operation.accountMerge({ destination: x2.publicKey(), source: vB.publicKey() })], [x2, vB]), 'merges vB after its fee was charged');
  await enqueue('race-attacker-remove-tx-signer', classic(x3, [S.Operation.setOptions({ signer: { ed25519PublicKey: sC.publicKey(), weight: 0 }, source: vC.publicKey() })], [x3, vC]), 'removes the only key that signed vC\'s transaction');
  await enqueue('race-attacker-remove-op-signer', classic(vD, [S.Operation.setOptions({ signer: { ed25519PublicKey: sD.publicKey(), weight: 0 } })]), 'removes the key that signed for vD as operation source');
  await enqueue('race-attacker-merge-op-source', classic(vF, [S.Operation.accountMerge({ destination: x2.publicKey() })]), 'vF merges itself away');
  await enqueue('race-attacker-bump-sequence-ledger', classic(x4, [S.Operation.bumpSequence({ bumpTo: '0', source: vG.publicKey() })], [x4, vG]), 'bumpTo 0 changes no sequence number but sets vG seqLedger to this ledger');
  // Soroban phase: six victims, each valid against the previous ledger
  await enqueue('race-victim-txBAD_SEQ', soroban(vA, ttl(), fp), 'vA\'s sequence number was bumped earlier in the ledger');
  await enqueue('race-victim-txNO_ACCOUNT', soroban(vB, ttl(), fp), 'vB was merged earlier in the ledger');
  await enqueue('race-victim-txBAD_AUTH', soroban(vC, ttl(), fp, [sC]), 'signed only by sC, removed earlier in the ledger');
  await enqueue('race-victim-opBAD_AUTH', soroban(y1, ttl(vD), fp, [y1, sD]), 'operation source vD, signed by sD, removed earlier in the ledger');
  await enqueue('race-victim-opNO_ACCOUNT', soroban(y2, ttl(vF), fp, [y2, vF]), 'operation source vF, merged earlier in the ledger');
  { const data = new S.SorobanDataBuilder().setFootprint(fp.ro, []).setResources(RES.ins, RES.read, RES.write).setResourceFee(RES.fee).build();
    const t = new S.TransactionBuilder(new S.Account(vG.publicKey(), seq.get(vG.publicKey()).toString()), { fee: String(1000 + RES.fee), networkPassphrase: passphrase, timebounds: TB })
      .setMinAccountSequenceLedgerGap(1).addOperation(ttl()).setSorobanData(data).build(); t.sign(vG);
    await enqueue('race-victim-txBAD_MIN_SEQ_AGE_OR_GAP', t, 'minSeqLedgerGap 1, and vG\'s seqLedger moved to this ledger'); }
  await closeGroup('apply-time-failures');
  manifest.accounts.race = Object.fromEntries(Object.entries({ x1, x2, x3, x4, vA, vB, vC, vD, vF, vG, y1, y2, sC, sD }).map(([n, k]) => [n, k.publicKey()])); }

// ---- B2d: kit v2 (recipes/soroban/kit2, soroban-sdk 28) ---------------------------
const wasm2 = readFileSync(new URL('../wasm/xdrproof_kit2.wasm', import.meta.url));
const wasm2Hash = sha(wasm2); manifest.contracts.kit2_wasm_hash = wasm2Hash.toString('hex');
await submit('kit2-upload-wasm', soroban(alice, S.Operation.uploadContractWasm({ wasm: wasm2 }), { rw: [kCode(wasm2Hash)] }));
const kSigner = (who) => xdr.ScVal.scvVec([sym('Signer'), A(who)]); // kit2's Key::Signer(Address)
const deployKit2 = (deployer, salt, owner, tag, signers) => {
  const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(deployer.publicKey()), salt: sha('xdrproof:kit2:' + salt) }));
  const id = contractId(preimage);
  const args = new xdr.CreateContractArgsV2({ contractIdPreimage: preimage, executable: xdr.ContractExecutable.contractExecutableWasm(wasm2Hash),
    constructorArgs: [A(owner), sym(tag), xdr.ScVal.scvVec(signers.map(A))] });
  const auth = srcAuth(new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(args), subInvocations: [] }));
  const tx = soroban(deployer, S.Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeCreateContractV2(args), auth: [auth] }),
    { ro: [kCode(wasm2Hash)], rw: [kInstance(id), ...signers.map((s) => kData(id, kSigner(s)))] });
  return { id, tx };
};
// H-B14 setup: three custom accounts, each accepting the next as its only delegate: CA1 -> CA2 -> CA3 -> bob (G).
// Contract IDs are known before deployment, so the three deploys are independent and share one ledger.
const ids = {}; ids.CA1 = contractId(xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(alice.publicKey()), salt: sha('xdrproof:kit2:ca1') })));
ids.CA2 = contractId(xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(bob.publicKey()), salt: sha('xdrproof:kit2:ca2') })));
const ca3 = deployKit2(issuer, 'ca3', alice.publicKey(), 'ca3', [bob.publicKey()]);
const ca2 = deployKit2(bob, 'ca2', alice.publicKey(), 'ca2', [ca3.id]);
const ca1 = deployKit2(alice, 'ca1', alice.publicKey(), 'ca1', [ca2.id]);
if (ca1.id !== ids.CA1 || ca2.id !== ids.CA2) throw new Error('contract id derivation');
await enqueue('kit2-deploy-ca3-constructor-args', ca3.tx, 'constructor(owner, tag, [bob])');
await enqueue('kit2-deploy-ca2-constructor-args', ca2.tx, 'constructor(owner, tag, [CA3])');
await enqueue('kit2-deploy-ca1-constructor-args', ca1.tx, 'constructor(owner, tag, [CA2])');
await closeGroup('kit2-deploys');
const [CA1, CA2, CA3] = [ca1.id, ca2.id, ca3.id]; manifest.contracts.kit2 = { CA1, CA2, CA3 };

// H-D10: one contract holds (CA1, "dup", persistent) and (CA1, "dup", temporary): same contract and key,
// two ledger entries; the same key also lands in instance storage. And a non-SAC contract writes a
// SAC-shaped ["Balance", bob] key.
await enqueue('kit2-same-key-three-durabilities', soroban(alice, invoke(CA1, 'put_all', [sym('dup'), xdr.ScVal.scvU32(10)]),
  { ro: [kCode(wasm2Hash)], rw: [kInstance(CA1), kData(CA1, sym('dup'), DUR.persistent), kData(CA1, sym('dup'), DUR.temporary)] }),
  'put_all("dup", 10): persistent and temporary entries with one key, and an instance-storage map entry');
{ const k = xdr.ScVal.scvVec([sym('Balance'), A(bob.publicKey())]);
  await enqueue('kit-put-sac-shaped-balance-key', soroban(bob, invoke(K0, 'put', [k, i128(1234)]), { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, k)] }),
    'a plain contract stores ["Balance", bob] -> i128 1234: the key shape of a SAC balance, but no token'); }
await closeGroup('kit2-storage');

// H-B14: K0.nest(CA1, []) requires CA1's authorization. CA1's auth entry uses address credentials with
// delegates (CAP-0071-01): CA1 delegates to CA2, CA2 to CA3, CA3 to bob, whose ed25519 signature is the only
// real one. Every level signs the same payload, bound to the top-level address CA1.
{ const nonce = 7101001, nargs = [A(CA1), xdr.ScVal.scvVec([])];
  const inv = fnInv(K0, 'nest', nargs);
  const payload = sha(xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(new xdr.HashIdPreimageSorobanAuthorizationWithAddress({
    networkId, nonce: i64(String(nonce)), signatureExpirationLedger: EXPIRES, address: addr(CA1), invocation: inv })).toXDR());
  const bobSig = xdr.ScVal.scvVec([xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sym('public_key'), val: xdr.ScVal.scvBytes(bob.rawPublicKey()) }),
    new xdr.ScMapEntry({ key: sym('signature'), val: xdr.ScVal.scvBytes(bob.sign(payload)) })])]);
  const del = (address, signature, nestedDelegates = []) => new xdr.SorobanDelegateSignature({ address, signature, nestedDelegates });
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddressWithDelegates(new xdr.SorobanAddressCredentialsWithDelegates({
    addressCredentials: new xdr.SorobanAddressCredentials({ address: addr(CA1), nonce: i64(String(nonce)), signatureExpirationLedger: EXPIRES, signature: xdr.ScVal.scvVoid() }),
    delegates: [del(addr(CA2), xdr.ScVal.scvVoid(), [del(addr(CA3), xdr.ScVal.scvVoid(), [del(addr(bob.publicKey()), bobSig)])])] }));
  await submit('custom-account-nested-delegates', soroban(alice, invoke(K0, 'nest', nargs, [new xdr.SorobanAuthorizationEntry({ credentials, rootInvocation: inv })]),
    { ro: [kInstance(K0), kCode(wasmHash), kInstance(CA1), kInstance(CA2), kInstance(CA3), kCode(wasm2Hash),
      kData(CA1, kSigner(CA2)), kData(CA2, kSigner(CA3)), kData(CA3, kSigner(bob.publicKey())), kAccount(bob)],
    rw: [kData(CA1, xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({ nonce: i64(String(nonce)) })), DUR.temporary)] }),
    'SOROBAN_CREDENTIALS_ADDRESS_WITH_DELEGATES: CA1 -> CA2 -> CA3 -> bob, three levels of nestedDelegates'); }

// H-D11: CA1 owns an executable-reference entry "kit" (key SCV_EXECUTABLE_TAG) pointing at the v1 kit Wasm;
// a contract deployed with CONTRACT_EXECUTABLE_EXTERNAL_REF {CA1, "kit"} then runs that Wasm.
const tagKey = xdr.ScVal.scvExecutableTag('kit');
await submit('kit2-set-executable-ref', soroban(alice, invoke(CA1, 'set_ref', [xdr.ScVal.scvString('kit'), xdr.ScVal.scvBytes(wasmHash)]),
  { ro: [kInstance(CA1), kCode(wasm2Hash), kCode(wasmHash)], rw: [kData(CA1, tagKey)] }), 'executable-reference entry (CA1, SCV_EXECUTABLE_TAG "kit") -> v1 kit Wasm hash');
{ const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(alice.publicKey()), salt: sha('xdrproof:kit:external-ref') }));
  const XR = contractId(preimage); manifest.contracts.kit_external_ref = XR;
  const args = new xdr.CreateContractArgsV2({ contractIdPreimage: preimage, constructorArgs: [],
    executable: xdr.ContractExecutable.contractExecutableExternalRef(new xdr.ContractExecutableExternalRef({ executableOwner: addr(CA1), tag: 'kit' })) });
  const auth = srcAuth(new xdr.SorobanAuthorizedInvocation({ function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(args), subInvocations: [] }));
  await submit('deploy-external-ref-executable', soroban(alice, S.Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeCreateContractV2(args), auth: [auth] }),
    { ro: [kData(CA1, tagKey), kCode(wasmHash)], rw: [kInstance(XR)] }), 'CreateContractV2 with CONTRACT_EXECUTABLE_EXTERNAL_REF {owner CA1, tag "kit"}');
  await submit('invoke-external-ref-contract', soroban(alice, invoke(XR, 'put', [sym('via_ref'), xdr.ScVal.scvU32(85)]),
    { ro: [kInstance(XR), kData(CA1, tagKey), kCode(wasmHash)], rw: [kData(XR, sym('via_ref'))] }), 'the external-ref contract runs the v1 kit code: put("via_ref", 85)'); }

// ---- B2d: network settings upgrades (H-F10), frozen keys (H-D12), Soroban surge pricing (H-C18) --------
// Core reads a ConfigUpgradeSet from any contract's TEMPORARY entry keyed by SCV_BYTES(sha256(set)) whose
// value is SCV_BYTES(set) (Upgrades.cpp, ConfigUpgradeSetFrame::makeFromKey and getLedgerKey). kit2's
// put_all writes one, so upgrades are staged deterministically; core's get-settings-upgrade-txs would pick
// a random salt. The upgrade applies at the end of the ledger it is armed for, after that ledger's txs.
// staging and arming are separate so an upgrade can be staged while kit2 is still callable (section (5) below)
const stageConfigUpgrade = async (name, entries) => {
  const set = new xdr.ConfigUpgradeSet({ updatedEntry: entries }).toXDR(); const hash = sha(set);
  const k = xdr.ScVal.scvBytes(hash), v = xdr.ScVal.scvBytes(set);
  await submit(name + '-staged', soroban(alice, invoke(CA1, 'put_all', [k, v]),
    { ro: [kCode(wasm2Hash)], rw: [kInstance(CA1), kData(CA1, k, DUR.persistent), kData(CA1, k, DUR.temporary)] }), 'ConfigUpgradeSet bytes in a temporary entry of CA1');
  return { hash, key: new xdr.ConfigUpgradeSetKey({ contractId: new xdr.ContractId(S.StrKey.decodeContract(CA1)), contentHash: hash }).toXDR('base64') };
};
const armConfigUpgrade = async (name, { hash, key }, note) => {
  // core answers an accepted key with an empty body (CommandHandler::upgrades) and clears it once the upgrade
  // applies (Upgrades::removeUpgrades), so the pending-upgrade report must change on arming and return after the close
  const before = await get('upgrades?mode=get');
  const r = (await get('upgrades?mode=set&upgradetime=1970-01-01T00:00:00Z&configupgradesetkey=' + encodeURIComponent(key))).trim();
  if (r) throw new Error(name + ': upgrade key refused: ' + r);
  if ((await get('upgrades?mode=get')) === before) throw new Error(name + ': nothing armed');
  await close();
  if ((await get('upgrades?mode=get')) !== before) throw new Error(name + ': still pending after the close, not applied');
  manifest.steps.push({ name, ledger, note, config_upgrade_set: hash.toString('hex') }); console.log(String(ledger).padStart(3), name, 'applied');
};
const configUpgrade = async (name, entries, note) => armConfigUpgrade(name, await stageConfigUpgrade(name, entries), note);
const [fzIssuer, fzHolder, fzMaker, fzTaker, fzPoolA, fzPoolB] = ['issuer', 'holder', 'maker', 'taker', 'pool-a', 'pool-b'].map((n) => kp('freeze-' + n));
const fzAll = [fzIssuer, fzHolder, fzMaker, fzTaker, fzPoolA, fzPoolB];
const FRZ = new S.Asset('FRZ', fzIssuer.publicKey()), FRP = new S.Asset('FRP', fzIssuer.publicKey());
await submit('freeze-setup-accounts', classic(root, fzAll.map((k) => S.Operation.createAccount({ destination: k.publicKey(), startingBalance: '1000' }))));
for (const k of fzAll) seq.set(k.publicKey(), BigInt(ledger) << 32n);
await submit('freeze-setup-trustlines', classic(fzIssuer, [[fzHolder, FRZ], [fzMaker, FRZ], [fzTaker, FRZ], [fzPoolA, FRP], [fzPoolB, FRP]]
  .map(([k, a]) => S.Operation.changeTrust({ asset: a, source: k.publicKey() })), fzAll));
const fzPay = (k, a) => S.Operation.payment({ destination: k.publicKey(), asset: a, amount: '100' });
const issueTx = classic(fzIssuer, [fzPay(fzHolder, FRZ), fzPay(fzMaker, FRZ), fzPay(fzPoolA, FRP), fzPay(fzPoolB, FRP),
  S.Operation.createClaimableBalance({ asset: FRZ, amount: '10', claimants: [new S.Claimant(fzHolder.publicKey(), S.Claimant.predicateUnconditional())] })]);
const fzBalance = issueTx.getClaimableBalanceId(4);
await submit('freeze-setup-issue-and-claimable-balance', issueTx);
const lpFRP = new S.LiquidityPoolAsset(S.Asset.native(), FRP, S.LiquidityPoolFeeV18);
const lpFRPId = Buffer.from(S.getLiquidityPoolId('constant_product', lpFRP.getLiquidityPoolParameters())).toString('hex');
const deposit = (amount) => S.Operation.liquidityPoolDeposit({ liquidityPoolId: lpFRPId, maxAmountA: amount, maxAmountB: amount, minPrice: '0.5', maxPrice: '2' });
await enqueue('freeze-setup-offer-holder', classic(fzHolder, [S.Operation.manageSellOffer({ selling: FRZ, buying: S.Asset.native(), amount: '10', price: '1' })]));
await enqueue('freeze-setup-offer-maker', classic(fzMaker, [S.Operation.manageSellOffer({ selling: FRZ, buying: S.Asset.native(), amount: '10', price: '2' })]));
await enqueue('freeze-setup-pool-a', classic(fzPoolA, [S.Operation.changeTrust({ asset: lpFRP }), deposit('50')]));
await enqueue('freeze-setup-pool-b', classic(fzPoolB, [S.Operation.changeTrust({ asset: lpFRP }), deposit('50')]));
await closeGroup('freeze-setup-market');
manifest.freeze = { accounts: Object.fromEntries(['issuer', 'holder', 'maker', 'taker', 'pool_a', 'pool_b'].map((n, i) => [n, fzAll[i].publicKey()])), pool: lpFRPId, claimable: fzBalance };

// U1: Soroban ledgerMaxTxCount 2, and freeze three trustlines (CAP-0077), in one upgrade (entries sorted by ID)
const maxTxCount = JSON.parse(await get('sorobaninfo')).ledger.max_tx_count;
const frozen = [kTrust(fzHolder, FRZ), kTrust(fzPoolA, FRP), kTrust(fzPoolB, FRP)].map((lk) => lk.toXDR());
const lanes = (n) => xdr.ConfigSettingEntry.configSettingContractExecutionLanes(new xdr.ConfigSettingContractExecutionLanesV0({ ledgerMaxTxCount: n }));
const freezeDelta = (keysToFreeze, keysToUnfreeze) => xdr.ConfigSettingEntry.configSettingFrozenLedgerKeysDelta(new xdr.FrozenLedgerKeysDelta({ keysToFreeze, keysToUnfreeze }));
await configUpgrade('config-upgrade-lanes-and-freeze', [lanes(2), freezeDelta(frozen, [])],
  'LEDGER_UPGRADE_CONFIG: Soroban ledgerMaxTxCount 2; freeze the holder FRZ, pool-a FRP and pool-b FRP trustlines');

// Frozen trustlines reached only at apply time (CAP-0077 "Apply time validation"): opaque claimable-balance
// and pool operations fail; the DEX removes an offer whose seller trustline is frozen and moves nothing.
await enqueue('frozen-claim-claimable-balance', classic(fzHolder, [S.Operation.claimClaimableBalance({ balanceId: fzBalance })]), 'CLAIM_CLAIMABLE_BALANCE_TRUSTLINE_FROZEN');
await enqueue('frozen-pool-deposit', classic(fzPoolA, [deposit('10')]), 'LIQUIDITY_POOL_DEPOSIT_TRUSTLINE_FROZEN');
await enqueue('frozen-pool-withdraw', classic(fzPoolB, [S.Operation.liquidityPoolWithdraw({ liquidityPoolId: lpFRPId, amount: '10', minAmountA: '0', minAmountB: '0' })]), 'LIQUIDITY_POOL_WITHDRAW_TRUSTLINE_FROZEN');
await enqueue('frozen-offer-removed-by-path-payment', classic(fzTaker, [S.Operation.pathPaymentStrictSend({ sendAsset: S.Asset.native(), sendAmount: '5',
  destination: fzTaker.publicKey(), destAsset: FRZ, destMin: '0.0000001', path: [] })]), 'the holder offer (frozen seller trustline) is removed with nothing moved; the maker offer fills');
await closeGroup('frozen-keys-at-apply-time');

// Soroban surge: three calls bid 3000, 2000 and 1000 per op for a two-transaction phase. Distinct bids keep
// the selection deterministic (equal bids are tie-broken by a random seed, ParallelTxSetBuilder.cpp:717).
const bidCall = (src, key, bid) => {
  const data = new S.SorobanDataBuilder().setFootprint([kInstance(K0), kCode(wasmHash)], [kData(K0, key)]).setResources(RES.ins, RES.read, RES.write).setResourceFee(RES.fee).build();
  const t = new S.TransactionBuilder(new S.Account(src.publicKey(), seq.get(src.publicKey()).toString()), { fee: String(bid), networkPassphrase: passphrase, timebounds: TB })
    .addOperation(invoke(K0, 'put', [key, xdr.ScVal.scvU32(bid)])).setSorobanData(data).build();
  t.sign(src); return t;
};
await enqueue('soroban-surge-bid-3000', bidCall(alice, sym('surge_3000'), 3000));
await enqueue('soroban-surge-bid-2000', bidCall(bob, sym('surge_2000'), 2000));
{ const late = bidCall(issuer, sym('surge_1000'), 1000);
  const r = JSON.parse(await get('tx?blob=' + encodeURIComponent(late.toEnvelope().toXDR('base64'))));
  if (r.status !== 'PENDING') throw new Error('soroban-surge-bid-1000: rejected at submission ' + JSON.stringify(r));
  seq.set(issuer.publicKey(), seq.get(issuer.publicKey()) + 1n);
  await closeGroup('soroban-surge-priced');
  await close(); manifest.steps.push({ name: 'soroban-surge-left-over-applies-next-ledger', ledger, tx: Buffer.from(late.hash()).toString('hex'), status: r.status });
  console.log(String(ledger).padStart(3), 'soroban-surge-left-over-applies-next-ledger'); }

// U2: restore the transaction count and unfreeze the three trustlines, so later recipes see normal limits
await configUpgrade('config-upgrade-restore-and-unfreeze', [lanes(maxTxCount), freezeDelta([], frozen)],
  `LEDGER_UPGRADE_CONFIG: Soroban ledgerMaxTxCount back to ${maxTxCount}; unfreeze the three trustlines`);

// ---- B2d: state archival: eviction with no transaction (H-D6), automatic restore vs RestoreFootprint (H-D7)
// U3 shortens lifetimes to the protocol minimums (persistent 10, temporary 16 ledgers) and starts the eviction
// scan at bucket level 1, where new entries live. U4 puts the settings back: every field from sorobaninfo,
// except the sample period, which sorobaninfo misreports (CommandHandler.cpp:930 prints the sample size
// twice), so it takes core's initial value (NetworkConfig.h:131, 64).
const sa = JSON.parse(await get('sorobaninfo')).state_archival;
const archival = (o) => xdr.ConfigSettingEntry.configSettingStateArchival(new xdr.StateArchivalSettings({
  maxEntryTtl: o.max_entry_ttl, minTemporaryTtl: o.min_temporary_ttl, minPersistentTtl: o.min_persistent_ttl,
  persistentRentRateDenominator: i64(String(o.persistent_rent_rate_denominator)), tempRentRateDenominator: i64(String(o.temp_rent_rate_denominator)),
  maxEntriesToArchive: o.max_entries_to_archive, liveSorobanStateSizeWindowSampleSize: o.bucketlist_size_window_sample_size,
  liveSorobanStateSizeWindowSamplePeriod: 64, evictionScanSize: o.eviction_scan_size, startingEvictionScanLevel: o.starting_eviction_scan_level }));
await configUpgrade('config-upgrade-short-lifetimes', [archival({ ...sa, min_temporary_ttl: 16, min_persistent_ttl: 10, starting_eviction_scan_level: 1, max_entries_to_archive: Math.max(100, sa.max_entries_to_archive) })],
  'LEDGER_UPGRADE_CONFIG: minPersistentTTL 10, minTemporaryTTL 16, eviction scan from level 1');
const [kAuto, kOp, kTmp] = [sym('archived_auto'), sym('archived_op'), sym('archived_tmp')];
await enqueue('archival-put-persistent-auto', soroban(alice, invoke(K0, 'put', [kAuto, xdr.ScVal.scvU32(1)]), { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, kAuto)] }), 'persistent, lives 10 ledgers');
await enqueue('archival-put-persistent-op', soroban(bob, invoke(K0, 'put', [kOp, xdr.ScVal.scvU32(2)]), { ro: [kInstance(K0), kCode(wasmHash)], rw: [kData(K0, kOp)] }), 'persistent, lives 10 ledgers');
await enqueue('archival-put-all-temporary', soroban(issuer, invoke(CA1, 'put_all', [kTmp, xdr.ScVal.scvU32(3)]),
  { ro: [kCode(wasm2Hash)], rw: [kInstance(CA1), kData(CA1, kTmp, DUR.persistent), kData(CA1, kTmp, DUR.temporary)] }), 'temporary lives 16 ledgers; its persistent twin 10');
await closeGroup('archival-entries-created');
const WAIT = Number(process.env.ARCHIVE_WAIT || 16); // empty ledgers: persistent entries evict 10 ledgers after creation, the temporary 16 (measured)
for (let i = 0; i < WAIT; i++) await close();
manifest.steps.push({ name: 'archival-empty-ledgers', ledger, note: `${WAIT} ledgers with no transactions; evicted_keys appear in some of them` });
console.log(String(ledger).padStart(3), `archival-empty-ledgers x${WAIT}`);
// The persistent entries now sit in the hot archive. A call restores one automatically when the transaction
// marks it in SorobanTransactionDataExt.v1 archivedSorobanEntries (CAP-0066); RestoreFootprint restores the other.
{ const data = new S.SorobanDataBuilder().setFootprint([kInstance(K0), kCode(wasmHash)], [kData(K0, kAuto)]).setResources(RES.ins, RES.read, RES.write).setResourceFee(RES.fee).build();
  data.ext = xdr.SorobanTransactionDataExt.resourceExt(new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: [0] }));
  const t = new S.TransactionBuilder(new S.Account(alice.publicKey(), seq.get(alice.publicKey()).toString()), { fee: String(1000 + RES.fee), networkPassphrase: passphrase, timebounds: TB })
    .addOperation(invoke(K0, 'put', [kAuto, xdr.ScVal.scvU32(11)])).setSorobanData(data).build(); t.sign(alice);
  await enqueue('archival-automatic-restore-in-invoke', t, 'readWrite[0] is archived; the call restores it, then overwrites it'); }
await enqueue('archival-restore-footprint', soroban(bob, S.Operation.restoreFootprint({}), { rw: [kData(K0, kOp)] }), 'RESTORE_FOOTPRINT of an evicted persistent entry');
await closeGroup('archival-restores');
await configUpgrade('config-upgrade-restore-lifetimes', [archival(sa)], 'LEDGER_UPGRADE_CONFIG: state archival settings back');

// ---- Failure suite 2, Soroban side (appended; earlier ledgers unchanged) ------------------------------------
// (1) Inner-transaction codes of fee bumps, and an outer txBAD_AUTH_EXTRA: classic attackers change an account in the
//     classic phase; Soroban victims queued for the same ledger re-check it at apply (TransactionFrame::commonValid,
//     processSignatures with checkAllSignaturesUsed) and fail. As in H-C16, the phase order makes this reproducible.
// plain accounts for the steps below the race: earlier accounts carry signer setups (carol needs 20 signatures)
const [v1dep, ttlF, rstF, rstW] = ['v1-deployer', 'ttl-fee', 'restore-fee', 'restore-write'].map((n) => kp('fs2s-' + n));
{ const [a1, a2, a3, a4, a5, a6, u1, u2, u3, u4, u5, u6, f1, f2, f3, f4, f5] =
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'f1', 'f2', 'f3', 'f4', 'f5'].map((n) => kp('race2-' + n));
  const [s3, s5, s6] = ['s3', 's5', 's6'].map((n) => kp('race2-signer-' + n));
  const fresh = [a1, a2, a3, a4, a5, a6, u1, u2, u3, u4, u5, u6, f1, f2, f3, f4, f5, v1dep, ttlF, rstF, rstW];
  await submit('race2-setup-accounts', classic(root, fresh.map((k) => S.Operation.createAccount({ destination: k.publicKey(), startingBalance: '1000' }))));
  for (const k of fresh) seq.set(k.publicKey(), BigInt(ledger) << 32n);
  await enqueue('race2-setup-only-signer-u3', classic(u3, [S.Operation.setOptions({ signer: { ed25519PublicKey: s3.publicKey(), weight: 1 }, lowThreshold: 1, medThreshold: 1, highThreshold: 1 })]));
  // u5 and u6 need weight 2: their master key (1) and s5/s6 (1) both sign, and core's signature checker stops at the needed
  // weight (SignatureChecker.cpp), so both signatures are used at submission
  const two = { lowThreshold: 2, medThreshold: 2, highThreshold: 2 };
  await enqueue('race2-setup-second-signer-u5', classic(u5, [S.Operation.setOptions({ signer: { ed25519PublicKey: s5.publicKey(), weight: 1 }, ...two })]));
  await enqueue('race2-setup-second-signer-u6', classic(u6, [S.Operation.setOptions({ signer: { ed25519PublicKey: s6.publicKey(), weight: 1 }, ...two })]));
  await closeGroup('race2-setup');
  const ttl2 = () => S.Operation.extendFootprintTtl({ extendTo: 60001 });
  const fp2 = { ro: [kData(K0, sym('collide'))] };
  const bump = (inner, fee) => { const fb = S.TransactionBuilder.buildFeeBumpTransaction(fee, (BigInt(inner.fee) - BigInt(RES.fee)).toString(), inner, passphrase); fb.sign(fee); return fb; };
  await enqueue('race2-attacker-bump-sequence', classic(a1, [S.Operation.bumpSequence({ bumpTo: String((BigInt(ledger) << 32n) + 1000n), source: u1.publicKey() })], [a1, u1]), 'bumps u1 past its queued inner transaction');
  await enqueue('race2-attacker-merge-inner-source', classic(a2, [S.Operation.accountMerge({ destination: a2.publicKey(), source: u2.publicKey() })], [a2, u2]), 'merges u2, the inner source; the fee source f2 stays');
  await enqueue('race2-attacker-remove-only-signer', classic(a3, [S.Operation.setOptions({ signer: { ed25519PublicKey: s3.publicKey(), weight: 0 }, source: u3.publicKey() })], [a3, s3]), 'removes s3, the only key that signed u3\'s inner transaction');
  await enqueue('race2-attacker-bump-sequence-ledger', classic(a4, [S.Operation.bumpSequence({ bumpTo: '0', source: u4.publicKey() })], [a4, u4]), 'sets u4\'s seqLedger to this ledger');
  await enqueue('race2-attacker-master-weight-2-inner', classic(a5, [S.Operation.setOptions({ masterWeight: 2, source: u5.publicKey() })], [a5, u5, s5]), 'u5\'s master key alone now meets the threshold: s5\'s signature on the inner transaction goes unused');
  await enqueue('race2-attacker-master-weight-2', classic(a6, [S.Operation.setOptions({ masterWeight: 2, source: u6.publicKey() })], [a6, u6, s6]), 'u6\'s master key alone now meets the threshold: s6\'s signature goes unused');
  await enqueue('race2-victim-inner-txBAD_SEQ', bump(soroban(u1, ttl2(), fp2), f1), 'fee bump by f1; the inner sequence number was bumped earlier in the ledger');
  await enqueue('race2-victim-inner-txNO_ACCOUNT', bump(soroban(u2, ttl2(), fp2), f2), 'fee bump by f2; the inner source was merged earlier in the ledger');
  await enqueue('race2-victim-inner-txBAD_AUTH', bump(soroban(u3, ttl2(), fp2, [s3]), f3), 'fee bump by f3; the inner transaction\'s only signer was removed');
  { const data = new S.SorobanDataBuilder().setFootprint(fp2.ro, []).setResources(RES.ins, RES.read, RES.write).setResourceFee(RES.fee).build();
    const t = new S.TransactionBuilder(new S.Account(u4.publicKey(), seq.get(u4.publicKey()).toString()), { fee: String(1000 + RES.fee), networkPassphrase: passphrase, timebounds: TB })
      .setMinAccountSequenceLedgerGap(1).addOperation(ttl2()).setSorobanData(data).build(); t.sign(u4);
    await enqueue('race2-victim-inner-txBAD_MIN_SEQ_AGE_OR_GAP', bump(t, f4), 'fee bump by f4; minSeqLedgerGap 1 and u4\'s seqLedger moved to this ledger'); }
  await enqueue('race2-victim-inner-txBAD_AUTH_EXTRA', bump(soroban(u5, ttl2(), fp2, [u5, s5]), f5), 'fee bump by f5; signed by u5 and s5, and at apply the master key alone suffices');
  await enqueue('race2-victim-txBAD_AUTH_EXTRA', soroban(u6, ttl2(), fp2, [u6, s6]), 'signed by u6 and s6; at apply the master key alone suffices');
  await closeGroup('race2-apply-time-failures');
  manifest.accounts.race2 = Object.fromEntries(Object.entries({ a1, a2, a3, a4, a5, a6, u1, u2, u3, u4, u5, u6, f1, f2, f3, f4, f5, s3, s5, s6 }).map(([n, k]) => [n, k.publicKey()])); }

// (2) A forged address-credentials signature: the host verifies it with ed25519 and fails with Error(Crypto, InvalidInput)
//     (soroban-env-host builtin_contracts/account_contract.rs, verify_sig_ed25519). alice signs nonce 7300001; the entry
//     carries nonce 7300002, so the signature covers a different payload.
{ const args = [A(alice.publicKey()), xdr.ScVal.scvVec([])];
  const e = await addrAuth(alice, 7300001, fnInv(K0, 'nest', args));
  e.credentials.address.nonce = 7300002n; // SDK 17 XDR objects carry plain fields; the signature stays the one over nonce 7300001
  await submit('forged-address-signature-crypto-error', soroban(bob, invoke(K0, 'nest', args, [e]), { ro: [kInstance(K0), kCode(wasmHash), kAccount(alice)], rw: [kNonce(alice, 7300002)] }),
    'bob submits a call carrying an auth entry for alice whose signature does not verify'); }

// (3) CREATE_CONTRACT (v1 host function) authorized by address credentials, auth root
//     SOROBAN_AUTHORIZED_FUNCTION_TYPE_CREATE_CONTRACT_HOST_FN. The host reads that arm into its V2 form (constructor
//     args empty) and hashes the signature payload from the V2 rendering (soroban-env-host auth.rs: from_xdr turns
//     CreateContractHostFn into CreateContractArgsV2; to_xdr writes CreateContractV2HostFn; get_signature_payload uses
//     root_invocation_to_xdr). So a v1 entry signed over its own bytes, as js-stellar-base's authorizeEntry signs it,
//     fails ed25519 verification, and the valid one carries a signature over bytes it does not contain.
{ const create = (salt) => { const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(new xdr.ContractIdPreimageFromAddress({ address: addr(v1dep.publicKey()), salt: sha('xdrproof:v1-create:' + salt) }));
    const executable = xdr.ContractExecutable.contractExecutableWasm(wasmHash);
    return { id: contractId(preimage), args: new xdr.CreateContractArgs({ contractIdPreimage: preimage, executable }),
      v2: new xdr.CreateContractArgsV2({ contractIdPreimage: preimage, executable, constructorArgs: [] }) }; };
  const inv = (fn) => new xdr.SorobanAuthorizedInvocation({ function: fn, subInvocations: [] });
  const v1fn = (c) => xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractHostFn(c.args);
  const deploy = (c, auth, nonce) => soroban(alice, S.Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeCreateContract(c.args), auth: [auth] }),
    { ro: [kCode(wasmHash), kAccount(v1dep)], rw: [kInstance(c.id), kNonce(v1dep, nonce)] });
  const a = create('signed-as-v1'), b = create('signed-over-v2');
  await submit('create-contract-v1-auth-signed-over-own-bytes', deploy(a, await addrAuth(v1dep, 7400001, inv(v1fn(a))), 7400001),
    'the v1 auth entry signed over its own bytes (as js-stellar-base signs it): ed25519 verification fails');
  const entry = await addrAuth(v1dep, 7400002, inv(xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(b.v2)));
  entry.rootInvocation = inv(v1fn(b)); // keep the signature over the V2 rendering, carry the v1 arm
  await submit('create-contract-v1-auth-signed-over-v2-rendering', deploy(b, entry, 7400002), 'the same v1 entry signed over the V2 rendering the host hashes: the contract is created');
  manifest.contracts.v1Created = b.id; manifest.accounts.v1Deployer = v1dep.publicKey(); }

// (4) TTL and restore failures at apply. The smallest resource fee core accepts is the non-refundable fee: probes with a
//     far-future sequence number answer txBAD_SEQ once the fee check (which runs first, in commonValidPreSeqNum) passes,
//     and txSOROBAN_INVALID below it, without queueing anything. The archived entry is kit2's persistent twin of
//     archived_tmp, evicted above and never restored.
// SDK 17 XDR objects serialise as SEP-0051 JSON: a void result arm becomes its name, e.g. "tx_bad_seq"
const resultCode = (r) => { if (!r.error) return r.status; const j = JSON.parse(JSON.stringify(xdr.TransactionResult.fromXDR(r.error, 'base64').result, (k, v) => (typeof v === 'bigint' ? String(v) : v))); return typeof j === 'string' ? j : Object.keys(j)[0]; };
const sorobanAt = (src, op, ro, rw, over, seqOff = 0n) => {
  const r = { ...RES, ...over };
  const data = new S.SorobanDataBuilder().setFootprint(ro, rw).setResources(r.ins, r.read, r.write).setResourceFee(r.fee).build();
  const t = new S.TransactionBuilder(new S.Account(src.publicKey(), (seq.get(src.publicKey()) + seqOff).toString()), { fee: String(1000 + r.fee), networkPassphrase: passphrase, timebounds: TB })
    .addOperation(op).setSorobanData(data).build(); t.sign(src); return t; };
const minResourceFee = async (src, op, ro, rw, over) => {
  const probe = async (fee) => resultCode(JSON.parse(await get('tx?blob=' + encodeURIComponent(sorobanAt(src, op, ro, rw, { ...over, fee }, 1000n).toEnvelope().toXDR('base64')))));
  const [a0, a1] = [await probe(0), await probe(RES.fee)];
  if (a0 !== 'tx_soroban_invalid' || a1 !== 'tx_bad_seq') throw new Error(`resource-fee probe: unexpected answers ${a0} ${a1}`);
  let lo = 0, hi = RES.fee; while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if ((await probe(mid)) === 'tx_bad_seq') hi = mid; else lo = mid; }
  return hi; };
const archivedTwin = kData(CA1, kTmp, DUR.persistent), live = kData(K0, sym('collide'));
{ const extendTo = sa.max_entry_ttl - 1;
  const opE = () => S.Operation.extendFootprintTtl({ extendTo });
  const feeE = await minResourceFee(ttlF, opE(), [live], [], {});
  await enqueue('extend-ttl-insufficient-refundable-fee', sorobanAt(ttlF, opE(), [live], [], { fee: feeE }), `resource fee ${feeE}: exactly the non-refundable part, nothing left for rent`);
  const feeR = await minResourceFee(rstF, S.Operation.restoreFootprint({}), [], [archivedTwin], {});
  await enqueue('restore-insufficient-refundable-fee', sorobanAt(rstF, S.Operation.restoreFootprint({}), [], [archivedTwin], { fee: feeR }), `resource fee ${feeR}: nothing left for rent`);
  await enqueue('restore-write-bytes-exceeded', soroban(rstW, S.Operation.restoreFootprint({}), { rw: [archivedTwin], write: 0 }), 'declares 0 write bytes for an archived entry');
  await closeGroup('ttl-restore-failures'); }

// (5) EXTEND_FOOTPRINT_TTL_RESOURCE_LIMIT_EXCEEDED: from protocol 23 an extension fails only when the entry is larger than
//     the network allows (ExtendFootprintTTLOpFrame.cpp, validateContractLedgerEntry; for code, TransactionUtils.cpp
//     maxContractSizeBytes). kit2's Wasm is 5364 bytes; the maximum contract size drops to its floor of 2000 bytes
//     (NetworkConfig.h, MinimumSorobanNetworkConfig::MAX_CONTRACT_SIZE), the extension of kit2's code fails, and the
//     maximum goes back. Nothing is uploaded meanwhile.
{ const find = (o, k) => (o && typeof o === 'object' ? (k in o ? o[k] : Object.values(o).map((v) => find(v, k)).find((v) => v !== undefined)) : undefined);
  const size0 = find(JSON.parse(await get('sorobaninfo')), 'max_contract_size');
  if (!Number.isInteger(size0) || size0 <= 5364) throw new Error('sorobaninfo: unexpected max_contract_size ' + size0);
  // stage the way back first: once the limit drops, kit2 (which stages upgrades) is itself too large to run
  const back = await stageConfigUpgrade('config-upgrade-contract-size-back', [xdr.ConfigSettingEntry.configSettingContractMaxSizeBytes(size0)]);
  await configUpgrade('config-upgrade-contract-size-2000', [xdr.ConfigSettingEntry.configSettingContractMaxSizeBytes(2000)], 'LEDGER_UPGRADE_CONFIG: contract_max_size_bytes 2000, the floor');
  await submit('extend-ttl-code-over-max-size', soroban(bob, S.Operation.extendFootprintTtl({ extendTo: sa.max_entry_ttl - 1 }), { ro: [kCode(wasm2Hash)] }), 'kit2\'s 5364-byte Wasm is now larger than the network allows');
  await armConfigUpgrade('config-upgrade-contract-size-back', back, `LEDGER_UPGRADE_CONFIG: contract_max_size_bytes back to ${size0}`); }

// ---- optional depth probe (not part of the corpus recipe): PROBE=1 KIT_INSTANCES=<n> --
if (process.env.PROBE) {
  const big = { ins: 240_000_000, read: 200_000, write: 20_000, fee: 400_000_000 };
  // 1. real call depth: chain of d distinct contracts, each requiring bob's... here alice's source auth
  for (const d of (process.env.PROBE_CALL || '').split(',').filter(Boolean).map(Number)) {
    const chain = kits.slice(0, d); const { inv, args } = nestTree(alice.publicKey(), chain);
    await submit('probe-call-depth-' + d, soroban(alice, invoke(K0, 'nest', args, [srcAuth(inv)]), { ...big, ro: [...chain.map(kInstance), kCode(wasmHash)] }));
  }
  // 2. authorization tree deeper than the call tree: K0.nest(alice, []) is the only real call;
  //    the root invocation carries a chain of D never-called sub-invocations.
  for (const D of (process.env.PROBE_TREE || '').split(',').filter(Boolean).map(Number)) {
    const args = [A(alice.publicKey()), xdr.ScVal.scvVec([])];
    let inv = null; for (let i = 0; i < D - 1; i++) inv = fnInv(kits[1 % kits.length], 'nest', args, inv ? [inv] : []);
    await submit('probe-tree-depth-' + D, soroban(alice, invoke(K0, 'nest', args, [srcAuth(fnInv(K0, 'nest', args, inv ? [inv] : []))]), { ...big, ro: [kInstance(K0), kCode(wasmHash)] }));
  }
}
manifest.final = JSON.parse(await get('info')).info.ledger;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(manifest.final);
