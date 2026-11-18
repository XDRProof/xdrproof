// Offline deterministic classic recipes. Usage: node gen.mjs <core-http-url> <passphrase> [manifest-out.json]
// No RPC: sequence numbers are computed from the (fixed) ledger numbers; close times are explicit.
import * as S from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
const [core, passphrase, manifestPath] = process.argv.slice(2);
import { writeFileSync } from 'node:fs';
const sha = (s) => createHash('sha256').update(s).digest();
const kp = (name) => S.Keypair.fromRawEd25519Seed(sha('xdrproof:' + name));
const root = S.Keypair.fromRawEd25519Seed(sha(passphrase));
const alice = kp('alice'), bob = kp('bob');
const T0 = 1767225600, STEP = 2592000; // 2026-01-01T00:00:00Z, 30 days per ledger (virtual clock outruns small steps)
const get = async (p) => (await fetch(core + '/' + p)).text();
let ledger = 1;
const close = async () => { ledger++; const r = await get(`manualclose?ledgerSeq=${ledger}&closeTime=${T0 + ledger * STEP}`); console.log('  ', r.trim()); };
const TB = { minTime: 0, maxTime: 0 };
const send = async (name, tx) => {
  const blob = encodeURIComponent(tx.toEnvelope().toXDR('base64'));
  const r = await get('tx?blob=' + blob); console.log(name, Buffer.from(tx.hash()).toString("hex"), r.trim());
  await close();
};
const build = (srcId, seq, ops) => { const b = new S.TransactionBuilder(new S.Account(srcId, seq), { fee: '1000', networkPassphrase: passphrase, timebounds: TB }); ops.forEach(o => b.addOperation(o)); return b.build(); };
console.log(await get('upgrades?mode=set&upgradetime=1970-01-01T00:00:00Z&protocolversion=30&basereserve=5000000'));
await close(); // ledger 2: protocol upgrade
let tx = build(root.publicKey(), '0', [S.Operation.createAccount({ destination: alice.publicKey(), startingBalance: '1000' }), S.Operation.createAccount({ destination: bob.publicKey(), startingBalance: '1000' })]);
tx.sign(root); await send('create-accounts', tx);          // ledger 3
let aseq = BigInt(3) << 32n;                                // alice created in ledger 3
tx = build(alice.publicKey(), (aseq).toString(), [S.Operation.payment({ destination: bob.publicKey(), asset: S.Asset.native(), amount: '1' })]);
tx.sign(alice); await send('payment', tx); aseq += 1n;      // ledger 4
const mSrc = new S.MuxedAccount(new S.Account(alice.publicKey(), aseq.toString()), '1');
const mOp = new S.MuxedAccount(new S.Account(alice.publicKey(), '0'), '18446744073709551615').accountId();
const mDst = new S.MuxedAccount(new S.Account(bob.publicKey(), '0'), '9223372036854775808').accountId();
tx = new S.TransactionBuilder(mSrc, { fee: '1000', networkPassphrase: passphrase, timebounds: TB }).addOperation(S.Operation.payment({ source: mOp, destination: mDst, asset: S.Asset.native(), amount: '2' })).build();
tx.sign(alice); await send('muxed-payment', tx); aseq += 1n; // ledger 5
const sp = (payload) => S.StrKey.encodeSignedPayload(new S.xdr.SignerKeyEd25519SignedPayload({ ed25519: bob.rawPublicKey(), payload }).toXDR());
tx = build(alice.publicKey(), aseq.toString(), [
  S.Operation.setOptions({ signer: { ed25519SignedPayload: sp(Buffer.concat([sha('xdrproof:payload:a'), sha('xdrproof:payload:b')])), weight: 1 } }),
  S.Operation.setOptions({ signer: { ed25519SignedPayload: sp(sha('xdrproof:payload:c').subarray(0, 29)), weight: 1 } })]);
tx.sign(alice); await send('add-signed-payload-signers', tx); // ledger 6

// ---- Ledgers 7+: the rest of the classic catalogue. Ledgers 3-6 above are unchanged. ----
const cur = new Map([[alice.publicKey(), aseq + 1n], [bob.publicKey(), 3n << 32n], [root.publicKey(), 1n]]);
const steps = [];
const acct = (k) => new S.Account(k.publicKey(), cur.get(k.publicKey()).toString());
const txb = (k, ops, opts = {}) => { const b = new S.TransactionBuilder(acct(k), { fee: '1000', networkPassphrase: passphrase, timebounds: TB, ...opts }); for (const o of ops) b.addOperation(o); return b.build(); };
const submit = async (name, tx, src, note = '') => {
  const r = JSON.parse(await get('tx?blob=' + encodeURIComponent(tx.toEnvelope().toXDR('base64'))));
  const hash = Buffer.from(tx.hash()).toString('hex');
  if (r.status === 'PENDING') cur.set(src.publicKey(), cur.get(src.publicKey()) + 1n);
  await close();
  steps.push({ name, ledger, tx: hash, status: r.status, note, ...(r.status === 'PENDING' ? {} : { error: r }) });
  console.log(name, ledger, hash.slice(0, 12), r.status);
};
const muxed = (k, id) => new S.MuxedAccount(new S.Account(k.publicKey(), '0'), id).accountId();
const [issuer, carol, mm, sponsor, eve, frank] = ['issuer', 'carol', 'mm', 'sponsor', 'eve', 'frank'].map(kp);
const XPF = new S.Asset('XPF', issuer.publicKey()), XPF12 = new S.Asset('XPFLONGCODE1', issuer.publicKey());
const MAXLIMIT = '922337203685.4775807';

let t = txb(root, [issuer, carol, mm, sponsor, eve, frank].map((k) => S.Operation.createAccount({ destination: k.publicKey(), startingBalance: k === mm ? '10000' : '1000' })));
t.sign(root); await submit('create-more-accounts', t, root);                                    // 7
for (const k of [issuer, carol, mm, sponsor, eve, frank]) cur.set(k.publicKey(), BigInt(ledger) << 32n);
t = txb(issuer, [S.Operation.setOptions({ setFlags: S.AuthRevocableFlag | S.AuthClawbackEnabledFlag, homeDomain: 'xdrproof.dev/home-domain-is-32ch' })]);
t.sign(issuer); await submit('issuer-flags-revocable-clawback-max-home-domain', t, issuer, 'AUTH_REVOCABLE|AUTH_CLAWBACK_ENABLED, 32-byte home domain'); // 8
t = txb(alice, [S.Operation.changeTrust({ asset: XPF }), S.Operation.changeTrust({ asset: XPF, source: bob.publicKey() }),
  S.Operation.changeTrust({ asset: XPF, source: mm.publicKey() }), S.Operation.changeTrust({ asset: XPF12, source: mm.publicKey(), limit: MAXLIMIT })]);
t.sign(alice, bob, mm); await submit('multi-source-change-trust-alphanum4-alphanum12', t, alice, 'one tx, three op sources, alphanum-12 code, i64::MAX limit'); // 9
t = txb(issuer, [S.Operation.payment({ destination: alice.publicKey(), asset: XPF, amount: '1000' }), S.Operation.payment({ destination: mm.publicKey(), asset: XPF, amount: '5000' }),
  S.Operation.payment({ destination: bob.publicKey(), asset: XPF, amount: '100' }), S.Operation.payment({ destination: mm.publicKey(), asset: XPF12, amount: '5000' })]);
t.sign(issuer); await submit('issue-assets', t, issuer);                                         // 10
t = txb(mm, [S.Operation.manageSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '100', price: '1' }),
  S.Operation.manageSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '100', price: '1.1' }),
  S.Operation.manageSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '100', price: '1.2' }),
  S.Operation.manageSellOffer({ selling: XPF12, buying: S.Asset.native(), amount: '1000', price: '0.5' }),
  S.Operation.manageSellOffer({ selling: XPF, buying: XPF12, amount: '1000', price: '2' })]);
t.sign(mm); await submit('maker-offers', t, mm);                                                 // 11
t = txb(alice, [S.Operation.manageBuyOffer({ selling: S.Asset.native(), buying: XPF, buyAmount: '250', price: '1.25' })]);
t.sign(alice); await submit('buy-offer-crosses-three-offers', t, alice, 'one op claims 3 offers at 3 prices, last one partially'); // 12
const lp = new S.LiquidityPoolAsset(S.Asset.native(), XPF, S.LiquidityPoolFeeV18);
const poolId = Buffer.from(S.getLiquidityPoolId('constant_product', lp.getLiquidityPoolParameters())).toString('hex');
t = txb(mm, [S.Operation.changeTrust({ asset: lp }), S.Operation.liquidityPoolDeposit({ liquidityPoolId: poolId, maxAmountA: '100', maxAmountB: '100', minPrice: '0.5', maxPrice: '2' })]);
t.sign(mm); await submit('pool-share-trustline-and-deposit', t, mm, 'pool ' + poolId);          // 13
t = txb(bob, [S.Operation.pathPaymentStrictSend({ sendAsset: S.Asset.native(), sendAmount: '10', destination: muxed(alice, '7'), destAsset: XPF, destMin: '0.0000001', path: [XPF12] })]);
t.sign(bob); await submit('path-payment-strict-send-via-alphanum12-to-muxed', t, bob, 'XLM -> XPFLONGCODE1 -> XPF, destination M-address id 7'); // 14
t = txb(mm, [S.Operation.liquidityPoolWithdraw({ liquidityPoolId: poolId, amount: '50', minAmountA: '0', minAmountB: '0' })]);
t.sign(mm); await submit('pool-withdraw', t, mm);                                                // 15
const P = S.Claimant;
t = txb(alice, [S.Operation.createClaimableBalance({ asset: XPF, amount: '50', claimants: [
  new P(bob.publicKey(), P.predicateAnd(P.predicateNot(P.predicateBeforeRelativeTime('60')), P.predicateOr(P.predicateBeforeAbsoluteTime('4102444800'), P.predicateUnconditional()))),
  new P(alice.publicKey(), P.predicateUnconditional())] })]);
const cb1 = t.getClaimableBalanceId(0);
t.sign(alice); await submit('claimable-balance-nested-predicates', t, alice, 'and(not(before_relative 60), or(before_absolute 2100-01-01, unconditional)); id ' + cb1); // 16
t = txb(alice, [S.Operation.claimClaimableBalance({ balanceId: cb1 })]);
t.sign(alice); await submit('claim-claimable-balance', t, alice);                                // 17
t = txb(alice, [S.Operation.createClaimableBalance({ asset: XPF, amount: '25', claimants: [new P(bob.publicKey(), P.predicateUnconditional())] })]);
const cb2 = t.getClaimableBalanceId(0);
t.sign(alice); await submit('claimable-balance-clawback-enabled', t, alice, 'flag CLAIMABLE_BALANCE_CLAWBACK_ENABLED inherited; id ' + cb2); // 18
t = txb(issuer, [S.Operation.clawbackClaimableBalance({ balanceId: cb2 })]);
t.sign(issuer); await submit('clawback-claimable-balance', t, issuer);                          // 19
t = txb(issuer, [S.Operation.clawback({ asset: XPF, from: mm.publicKey(), amount: '10' })]);
t.sign(issuer); await submit('clawback', t, issuer);                                             // 20
t = txb(issuer, [S.Operation.setTrustLineFlags({ trustor: bob.publicKey(), asset: XPF, flags: { authorized: false, authorizedToMaintainLiabilities: true } })]);
t.sign(issuer); await submit('set-trustline-flags-maintain-liabilities', t, issuer);            // 21
t = txb(sponsor, [S.Operation.beginSponsoringFutureReserves({ sponsoredId: eve.publicKey() }),
  S.Operation.manageData({ name: 'sponsored', value: 'yes', source: eve.publicKey() }),
  S.Operation.changeTrust({ asset: XPF, source: eve.publicKey() }),
  S.Operation.endSponsoringFutureReserves({ source: eve.publicKey() })]);
t.sign(sponsor, eve); await submit('sponsorship-sandwich', t, sponsor, 'data entry and trustline created under sponsorship'); // 22
t = txb(sponsor, [S.Operation.revokeDataSponsorship({ account: eve.publicKey(), name: 'sponsored' })]);
t.sign(sponsor); await submit('revoke-sponsorship', t, sponsor);                                // 23
const binary = Buffer.from(Array.from({ length: 64 }, (_, i) => (i % 2 ? 0xff : 0x00)));
t = txb(alice, [S.Operation.manageData({ name: 'xdrproof.binary', value: binary })]);
t.sign(alice); await submit('manage-data-binary-64-bytes', t, alice, 'value is 64 bytes, not UTF-8'); // 24
t = txb(alice, [S.Operation.manageData({ name: 'xdrproof.binary', value: null })]);
t.sign(alice); await submit('manage-data-delete', t, alice);                                     // 25
const pay = (from, to, amount = '1', asset = S.Asset.native()) => S.Operation.payment({ destination: to, asset, amount });
const badText = Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0xed, 0xa0, 0x80, ...Buffer.from('xdrproof-not-utf8-20b')]).subarray(0, 28);
t = txb(alice, [pay(alice, bob.publicKey())], { memo: new S.Memo(S.MemoText, badText) });
t.sign(alice); await submit('memo-text-not-utf8-28-bytes', t, alice, 'memo text bytes ' + badText.toString('hex')); // 26
t = txb(alice, [pay(alice, bob.publicKey())], { memo: S.Memo.id('18446744073709551615') });
t.sign(alice); await submit('memo-id-u64-max', t, alice);                                        // 27
t = txb(alice, [pay(alice, bob.publicKey())], { memo: S.Memo.hash(sha('xdrproof:memo-hash')) });
t.sign(alice); await submit('memo-hash', t, alice);                                              // 28
t = txb(alice, [pay(alice, bob.publicKey())], { memo: S.Memo.return(sha('xdrproof:memo-return')) });
t.sign(alice); await submit('memo-return', t, alice);                                            // 29
let inner = txb(alice, [pay(alice, bob.publicKey())]); inner.sign(alice);
t = S.TransactionBuilder.buildFeeBumpTransaction(carol, '2000', inner, passphrase); t.sign(carol);
await submit('fee-bump', t, alice, 'fee source carol pays for alice');                          // 30
inner = txb(alice, [pay(alice, mm.publicKey(), '999999', XPF)]); inner.sign(alice);
t = S.TransactionBuilder.buildFeeBumpTransaction(carol, '2000', inner, passphrase); t.sign(carol);
await submit('fee-bump-inner-failed', t, alice, 'inner payment underfunded: txFEE_BUMP_INNER_FAILED, fee still charged'); // 31
t = txb(alice, [pay(alice, mm.publicKey(), '999999', XPF)]);
t.sign(alice); await submit('failed-transaction-underfunded', t, alice, 'txFAILED / PAYMENT_UNDERFUNDED'); // 32
const extraPayload = sha('xdrproof:extra-signer');
const extra = S.StrKey.encodeSignedPayload(new S.xdr.SignerKeyEd25519SignedPayload({ ed25519: eve.rawPublicKey(), payload: extraPayload }).toXDR());
t = txb(bob, [pay(bob, alice.publicKey())], { ledgerbounds: { minLedger: 1, maxLedger: 0 }, minAccountSequence: cur.get(bob.publicKey()).toString(), minAccountSequenceAge: 0, minAccountSequenceLedgerGap: 0, extraSigners: [extra] });
t.sign(bob); t.addDecoratedSignature(eve.signPayloadDecorated(extraPayload));
await submit('preconditions-v2-extra-signed-payload-signer', t, bob, 'CAP-0021: ledger bounds, min seq, extra signer P-key'); // 33
const preimage = sha('xdrproof:hashx-preimage');
const preTx = new S.TransactionBuilder(new S.Account(frank.publicKey(), (cur.get(frank.publicKey()) + 1n).toString()), { fee: '1000', networkPassphrase: passphrase, timebounds: TB }).addOperation(pay(frank, alice.publicKey())).build();
t = txb(frank, [S.Operation.setOptions({ signer: { preAuthTx: preTx.hash(), weight: 1 } }), S.Operation.setOptions({ signer: { sha256Hash: sha(preimage), weight: 1 } })]);
t.sign(frank); await submit('add-preauth-and-hashx-signers', t, frank, 'T-key ' + Buffer.from(preTx.hash()).toString('hex')); // 34
await submit('preauth-tx-executes-and-signer-disappears', preTx, frank, 'no signatures; core removes the pre-auth signer'); // 35
t = txb(frank, [pay(frank, alice.publicKey())]); t.signHashX(preimage);
await submit('hashx-signed-transaction', t, frank, 'only signature is the sha256 preimage');      // 36
const bumpTo = cur.get(alice.publicKey()) + 1001n;
t = txb(alice, [S.Operation.bumpSequence({ bumpTo: bumpTo.toString() })]);
t.sign(alice); await submit('bump-sequence', t, alice); cur.set(alice.publicKey(), bumpTo);     // 37
t = txb(carol, [S.Operation.accountMerge({ destination: muxed(alice, '42') })]);
t.sign(carol); await submit('account-merge-to-muxed', t, carol, 'carol merged into alice M-address id 42'); // 38

// ---- Ledgers 39+: the failure suite. Several transactions per ledger, one per source account (core queues one
// per account), each built to fail at APPLY time with a specific result code, plus successes for op types not yet
// covered. Failed transactions are written into closed ledgers; indexers must handle them.
const queued = [];
const queue = async (label, tx, src) => {
  const r = JSON.parse(await get('tx?blob=' + encodeURIComponent(tx.toEnvelope().toXDR('base64'))));
  if (r.status === 'PENDING') cur.set(src.publicKey(), cur.get(src.publicKey()) + 1n);
  queued.push({ label, tx: Buffer.from(tx.hash()).toString('hex'), status: r.status, ...(r.status === 'PENDING' ? {} : { error: r }) });
};
const closeGroup = async (name, note) => {
  await close();
  steps.push({ name, ledger, txs: queued.splice(0), note });
  const s = steps[steps.length - 1];
  console.log(name, ledger, s.txs.map((x) => `${x.label}:${x.status}`).join(' '));
};
const one = (k, ops, opts) => { const x = txb(k, ops, opts); x.sign(k); return x; };
const fa = Array.from({ length: 40 }, (_, i) => kp('f' + String(i).padStart(2, '0')));
const ghost = (n) => kp('ghost-' + n).publicKey();

t = txb(root, fa.map((k) => S.Operation.createAccount({ destination: k.publicKey(), startingBalance: '100' })));
t.sign(root); await submit('create-failure-accounts', t, root, '40 accounts for the failure suite');                       // 39
for (const k of fa) cur.set(k.publicKey(), BigInt(ledger) << 32n);

const signerKey = kp('sponsored-signer').publicKey();
await queue('f04-trust-limit-1', one(fa[4], [S.Operation.changeTrust({ asset: XPF, limit: '1' })]), fa[4]);
await queue('f11-auth-immutable', one(fa[11], [S.Operation.setOptions({ setFlags: S.AuthImmutableFlag })]), fa[11]);
t = txb(alice, [S.Operation.createClaimableBalance({ asset: S.Asset.native(), amount: '1', claimants: [new P(fa[28].publicKey(), P.predicateBeforeAbsoluteTime('1'))] })]);
const cb3 = t.getClaimableBalanceId(0); t.sign(alice); await queue('alice-claimable-expired-predicate', t, alice);
t = txb(sponsor, [S.Operation.beginSponsoringFutureReserves({ sponsoredId: eve.publicKey() }),
  S.Operation.setOptions({ signer: { ed25519PublicKey: signerKey, weight: 1 }, source: eve.publicKey() }),
  S.Operation.endSponsoringFutureReserves({ source: eve.publicKey() })]);
t.sign(sponsor, eve); await queue('sponsor-eve-signer', t, sponsor);
await closeGroup('failure-suite-setup', 'small trust limit, AUTH_IMMUTABLE, an already-expired claimable balance, a sponsored signer'); // 40

await queue('PAYMENT_NO_DESTINATION', one(fa[0], [S.Operation.payment({ destination: ghost(1), asset: S.Asset.native(), amount: '1' })]), fa[0]);
await queue('PAYMENT_NO_TRUST', one(mm, [S.Operation.payment({ destination: fa[2].publicKey(), asset: XPF, amount: '1' })]), mm);
await queue('PAYMENT_SRC_NO_TRUST', one(fa[3], [S.Operation.payment({ destination: alice.publicKey(), asset: XPF, amount: '1' })]), fa[3]);
await queue('PAYMENT_NOT_AUTHORIZED', one(issuer, [S.Operation.payment({ destination: bob.publicKey(), asset: XPF, amount: '1' })]), issuer);
await queue('PAYMENT_SRC_NOT_AUTHORIZED', one(bob, [S.Operation.payment({ destination: alice.publicKey(), asset: XPF, amount: '1' })]), bob);
await queue('PAYMENT_LINE_FULL', one(alice, [S.Operation.payment({ destination: fa[4].publicKey(), asset: XPF, amount: '5' })]), alice);
await closeGroup('failed-payments', 'six failed payments, one per PaymentResult code reachable at apply time');           // 41

await queue('CREATE_ACCOUNT_ALREADY_EXIST', one(fa[6], [S.Operation.createAccount({ destination: alice.publicKey(), startingBalance: '10' })]), fa[6]);
await queue('CREATE_ACCOUNT_UNDERFUNDED', one(fa[7], [S.Operation.createAccount({ destination: ghost(2), startingBalance: '500' })]), fa[7]);
await queue('CREATE_ACCOUNT_LOW_RESERVE', one(fa[8], [S.Operation.createAccount({ destination: ghost(3), startingBalance: '0.1' })]), fa[8]);
await queue('CHANGE_TRUST_NO_ISSUER', one(fa[9], [S.Operation.changeTrust({ asset: new S.Asset('NOPE', ghost(4)) })]), fa[9]);
await queue('CHANGE_TRUST_INVALID_LIMIT', one(alice, [S.Operation.changeTrust({ asset: XPF, limit: '1' })]), alice);
await queue('SET_OPTIONS_CANT_CHANGE', one(fa[11], [S.Operation.setOptions({ clearFlags: S.AuthImmutableFlag })]), fa[11]);
await queue('SET_OPTIONS_AUTH_REVOCABLE_REQUIRED', one(fa[12], [S.Operation.setOptions({ setFlags: S.AuthClawbackEnabledFlag })]), fa[12]);
await queue('MANAGE_DATA_NAME_NOT_FOUND', one(fa[13], [S.Operation.manageData({ name: 'nope', value: null })]), fa[13]);
await queue('ACCOUNT_MERGE_NO_ACCOUNT', one(fa[14], [S.Operation.accountMerge({ destination: ghost(5) })]), fa[14]);
await queue('ACCOUNT_MERGE_HAS_SUB_ENTRIES', one(mm, [S.Operation.accountMerge({ destination: alice.publicKey() })]), mm);
await queue('ACCOUNT_MERGE_IS_SPONSOR', one(sponsor, [S.Operation.accountMerge({ destination: alice.publicKey() })]), sponsor);
await closeGroup('failed-account-trust-options-data-merge', 'create-account, change-trust, set-options, manage-data and account-merge failures'); // 42

await queue('MANAGE_SELL_OFFER_SELL_NO_TRUST', one(fa[16], [S.Operation.manageSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '1', price: '1' })]), fa[16]);
await queue('MANAGE_SELL_OFFER_BUY_NO_TRUST', one(fa[17], [S.Operation.manageSellOffer({ selling: S.Asset.native(), buying: XPF, amount: '1', price: '1' })]), fa[17]);
await queue('MANAGE_SELL_OFFER_UNDERFUNDED', one(alice, [S.Operation.manageSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '999999', price: '1' })]), alice);
await queue('MANAGE_SELL_OFFER_CROSS_SELF', one(mm, [S.Operation.manageSellOffer({ selling: S.Asset.native(), buying: XPF, amount: '10', price: '0.5' })]), mm);
await queue('MANAGE_SELL_OFFER_NOT_FOUND', one(eve, [S.Operation.manageSellOffer({ selling: S.Asset.native(), buying: XPF, amount: '1', price: '1', offerId: '999999' })]), eve);
await queue('MANAGE_SELL_OFFER_SELL_NOT_AUTHORIZED', one(bob, [S.Operation.manageSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '1', price: '1' })]), bob);
await queue('MANAGE_BUY_OFFER_BUY_NO_TRUST', one(fa[19], [S.Operation.manageBuyOffer({ selling: S.Asset.native(), buying: XPF, buyAmount: '1', price: '1' })]), fa[19]);
await queue('MANAGE_BUY_OFFER_SELL_NO_TRUST', one(frank, [S.Operation.manageBuyOffer({ selling: XPF, buying: S.Asset.native(), buyAmount: '1', price: '1' })]), frank);
await closeGroup('failed-offers', 'manage-sell-offer and manage-buy-offer failures, including crossing your own offer'); // 43

await queue('CREATE_PASSIVE_SELL_OFFER', one(alice, [S.Operation.createPassiveSellOffer({ selling: XPF, buying: S.Asset.native(), amount: '10', price: '5' })]), alice);
await queue('MANAGE_OFFER_UPDATED', one(mm, [S.Operation.manageSellOffer({ selling: XPF12, buying: S.Asset.native(), amount: '900', price: '0.5', offerId: '4' })]), mm);
await queue('PATH_PAYMENT_STRICT_RECEIVE_THROUGH_POOL', one(fa[21], [S.Operation.pathPaymentStrictReceive({ sendAsset: S.Asset.native(), sendMax: '100', destination: alice.publicKey(), destAsset: XPF, destAmount: '1', path: [] })]), fa[21]);
await queue('ALLOW_TRUST', one(issuer, [S.Operation.allowTrust({ trustor: bob.publicKey(), assetCode: 'XPF', authorize: 1 })]), issuer);
await queue('REVOKE_SPONSORSHIP_SIGNER', one(sponsor, [S.Operation.revokeSignerSponsorship({ account: eve.publicKey(), signer: { ed25519PublicKey: signerKey } })]), sponsor);
{ // a transaction with no preconditions at all (PRECOND_NONE): the SDK always writes time bounds, so clear them
  const x = txb(frank, [S.Operation.payment({ destination: alice.publicKey(), asset: S.Asset.native(), amount: '1' })]);
  const env = x.toEnvelope(); env.v1.tx.cond = S.xdr.Preconditions.precondNone();
  const y = new S.Transaction(env, passphrase); y.sign(frank); await queue('PRECOND_NONE', y, frank);
}
await closeGroup('rare-successes', 'passive offer, offer update, strict-receive path payment through a pool, allow_trust, signer sponsorship revoked, no preconditions'); // 44

await queue('PATH_PAYMENT_STRICT_RECEIVE_NO_DESTINATION', one(fa[22], [S.Operation.pathPaymentStrictReceive({ sendAsset: S.Asset.native(), sendMax: '2', destination: ghost(6), destAsset: S.Asset.native(), destAmount: '1', path: [] })]), fa[22]);
await queue('PATH_PAYMENT_STRICT_SEND_UNDER_DESTMIN', one(fa[23], [S.Operation.pathPaymentStrictSend({ sendAsset: S.Asset.native(), sendAmount: '1', destination: alice.publicKey(), destAsset: XPF, destMin: '1000', path: [] })]), fa[23]);
await queue('PATH_PAYMENT_STRICT_RECEIVE_TOO_FEW_OFFERS', one(fa[24], [S.Operation.pathPaymentStrictReceive({ sendAsset: S.Asset.native(), sendMax: '0.0000001', destination: alice.publicKey(), destAsset: XPF, destAmount: '100', path: [] })]), fa[24]);
await queue('PATH_PAYMENT_STRICT_RECEIVE_OVER_SENDMAX', one(fa[20], [S.Operation.pathPaymentStrictReceive({ sendAsset: S.Asset.native(), sendMax: '0.0000001', destination: alice.publicKey(), destAsset: XPF, destAmount: '1', path: [] })]), fa[20]);
await queue('PATH_PAYMENT_STRICT_SEND_NO_TRUST', one(fa[25], [S.Operation.pathPaymentStrictSend({ sendAsset: S.Asset.native(), sendAmount: '1', destination: alice.publicKey(), destAsset: XPF12, destMin: '0.0000001', path: [] })]), fa[25]);
await queue('PATH_PAYMENT_STRICT_SEND_UNDERFUNDED', one(fa[26], [S.Operation.pathPaymentStrictSend({ sendAsset: S.Asset.native(), sendAmount: '5000', destination: alice.publicKey(), destAsset: XPF, destMin: '0.0000001', path: [] })]), fa[26]);
await queue('CLAIM_CLAIMABLE_BALANCE_DOES_NOT_EXIST', one(fa[27], [S.Operation.claimClaimableBalance({ balanceId: cb1 })]), fa[27]);
await queue('CLAIM_CLAIMABLE_BALANCE_CANNOT_CLAIM', one(fa[28], [S.Operation.claimClaimableBalance({ balanceId: cb3 })]), fa[28]);
await queue('LIQUIDITY_POOL_DEPOSIT_NO_TRUST', one(fa[31], [S.Operation.liquidityPoolDeposit({ liquidityPoolId: poolId, maxAmountA: '1', maxAmountB: '1', minPrice: '0.5', maxPrice: '2' })]), fa[31]);
await queue('LIQUIDITY_POOL_WITHDRAW_NO_TRUST', one(fa[32], [S.Operation.liquidityPoolWithdraw({ liquidityPoolId: poolId, amount: '1', minAmountA: '0', minAmountB: '0' })]), fa[32]);
await queue('LIQUIDITY_POOL_DEPOSIT_BAD_PRICE', one(mm, [S.Operation.liquidityPoolDeposit({ liquidityPoolId: poolId, maxAmountA: '10', maxAmountB: '10', minPrice: '5', maxPrice: '6' })]), mm);
await queue('REVOKE_SPONSORSHIP_NOT_SPONSOR', one(fa[33], [S.Operation.revokeTrustlineSponsorship({ account: eve.publicKey(), asset: XPF })]), fa[33]);
await queue('REVOKE_SPONSORSHIP_DOES_NOT_EXIST', one(fa[34], [S.Operation.revokeDataSponsorship({ account: fa[34].publicKey(), name: 'nope' })]), fa[34]);
await queue('END_SPONSORING_FUTURE_RESERVES_NOT_SPONSORED', one(fa[35], [S.Operation.endSponsoringFutureReserves({})]), fa[35]);
await queue('txBAD_SPONSORSHIP', one(fa[36], [S.Operation.beginSponsoringFutureReserves({ sponsoredId: fa[37].publicKey() })]), fa[36]);
t = txb(sponsor, [S.Operation.beginSponsoringFutureReserves({ sponsoredId: eve.publicKey() }), S.Operation.beginSponsoringFutureReserves({ sponsoredId: eve.publicKey() }),
  S.Operation.endSponsoringFutureReserves({ source: eve.publicKey() })]);
t.sign(sponsor, eve); await queue('BEGIN_SPONSORING_FUTURE_RESERVES_ALREADY_SPONSORED', t, sponsor);
await closeGroup('failed-paths-claims-pools-sponsorship', 'path payment, claimable balance, liquidity pool and sponsorship failures, and txBAD_SPONSORSHIP'); // 45

await queue('CLAWBACK_UNDERFUNDED', one(issuer, [S.Operation.clawback({ asset: XPF, from: alice.publicKey(), amount: '999999' })]), issuer);
await queue('LIQUIDITY_POOL_WITHDRAW_UNDERFUNDED', one(mm, [S.Operation.liquidityPoolWithdraw({ liquidityPoolId: poolId, amount: '999', minAmountA: '0', minAmountB: '0' })]), mm);
await closeGroup('failed-clawback-and-withdraw', 'clawback more than the balance; withdraw more pool shares than held');        // 46
await queue('CLAWBACK_NO_TRUST', one(issuer, [S.Operation.clawback({ asset: XPF, from: fa[29].publicKey(), amount: '1' })]), issuer);
await closeGroup('failed-clawback-no-trust', 'clawback from an account with no trustline');                                       // 47
await queue('SET_TRUST_LINE_FLAGS_NO_TRUST_LINE', one(issuer, [S.Operation.setTrustLineFlags({ trustor: fa[30].publicKey(), asset: XPF, flags: { authorized: true } })]), issuer);
await closeGroup('failed-set-trustline-flags', 'set trustline flags where there is no trustline');                               // 48
await queue('CLAWBACK_CLAIMABLE_BALANCE_DOES_NOT_EXIST', one(issuer, [S.Operation.clawbackClaimableBalance({ balanceId: cb1 })]), issuer);
await closeGroup('failed-clawback-claimable-balance', 'clawback of a claimable balance that no longer exists');                    // 49

if (manifestPath) writeFileSync(manifestPath, JSON.stringify({ passphrase, steps, accounts: Object.fromEntries([['root', root], ['alice', alice], ['bob', bob], ['issuer', issuer], ['carol', carol], ['mm', mm], ['sponsor', sponsor], ['eve', eve], ['frank', frank]].map(([n, k]) => [n, k.publicKey()])), assets: { XPF: XPF.toString(), XPF12: XPF12.toString() }, pool: poolId, claimable: [cb1, cb2] }, null, 1));
