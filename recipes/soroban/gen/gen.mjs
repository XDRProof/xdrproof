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
  if (r.status !== 'PENDING') { console.log(name, 'REJECTED', JSON.stringify(r)); manifest.steps.push({ name, rejected: r }); return false; }
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
