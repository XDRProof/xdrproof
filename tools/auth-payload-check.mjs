#!/usr/bin/env node
// auth-payload-check.mjs: hazard H-B16 checked without any Stellar SDK or host code.
// For each variant of the two v1 create-contract entries, the authorization preimage is encoded by hand from the
// on-chain entry, once as the entry's own SOROBAN_AUTHORIZED_FUNCTION_TYPE_CREATE_CONTRACT_HOST_FN (arm 1,
// CreateContractArgs) and once as its CREATE_CONTRACT_V2_HOST_FN rendering (arm 2, CreateContractArgsV2 with an
// empty constructor-argument vector), and the entry's ed25519 signature is verified against both with node:crypto.
// Expected: the entry signed over its own bytes verifies only as v1 (and core failed it); the entry core accepted
// verifies only as V2.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { decode } from './lib.mjs';
import * as K from './strkey.mjs';
import { ROOT } from './atoms.mjs';

const CASES = { 'auth.create-contract-v1-signed-over-own-bytes': 'v1', 'auth.create-contract-v1-signature-covers-v2-rendering': 'v2' };
const sha = (b) => createHash('sha256').update(b).digest();
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const i64 = (s) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(s)); return b; };
const hex = (h) => Buffer.from(h, 'hex');
// XDR by hand: ScAddress(account) = SC_ADDRESS_TYPE_ACCOUNT 0, PUBLIC_KEY_TYPE_ED25519 0, key;
// ContractIDPreimage FROM_ADDRESS 0 + address + salt; ContractExecutable WASM 0 + hash
const account = (g) => Buffer.concat([u32(0), u32(0), K.decode(g).payload]);
const createArgs = (f) => Buffer.concat([u32(0), account(f.contract_id_preimage.address.address), hex(f.contract_id_preimage.address.salt), u32(0), hex(f.executable.wasm)]);
const invocation = (f, arm) => Buffer.concat([u32(arm), createArgs(f), ...(arm === 2 ? [u32(0)] : []), u32(0)]); // + empty constructorArgs (V2), no sub-invocations
const preimage = (net, c, inv) => Buffer.concat([u32(9), sha(net), i64(c.nonce), u32(c.signature_expiration_ledger), inv]); // ENVELOPE_TYPE_SOROBAN_AUTHORIZATION 9
const edKey = (raw) => createPublicKey({ key: Buffer.concat([hex('302a300506032b6570032100'), raw]), format: 'der', type: 'spki' });

let bad = 0, n = 0;
for (const [id, signedAs] of Object.entries(CASES)) {
  const entry = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
  for (const v of entry.variants) {
    const f = join(ROOT, 'entries', id, v.file);
    const json = JSON.parse(decode('LedgerCloseMeta', f.endsWith('.zst') ? zstdDecompressSync(readFileSync(f)) : readFileSync(f)));
    const found = []; const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.root_invocation?.function?.create_contract_host_fn && x.credentials?.address) found.push(x); Object.values(x).forEach(walk); } };
    walk(Object.values(json)[0].tx_set);
    if (found.length !== 1) { console.log(`${id}@${v.key}: expected one v1 create auth entry, found ${found.length}`); bad++; continue; }
    const { credentials: { address: c }, root_invocation: { function: { create_contract_host_fn: fn } } } = found[0];
    const m = Object.fromEntries(c.signature.vec[0].map.map((e) => [e.key.symbol, e.val.bytes]));
    const sig = hex(m.signature), key = edKey(hex(m.public_key));
    const ok = (arm) => verify(null, sha(preimage(v.network_passphrase, c, invocation(fn, arm))), key, sig);
    const [v1, v2] = [ok(1), ok(2)]; n++;
    const pass = signedAs === 'v1' ? v1 && !v2 : v2 && !v1;
    if (!pass) bad++;
    console.log(`${pass ? 'ok ' : 'BAD'} ${id}@${v.key}: signature verifies over the v1 bytes ${v1}, over the V2 rendering ${v2}`);
  }
}
if (bad) { console.log(`\n${bad} variant(s) contradict H-B16.`); process.exit(1); }
console.log(`\nOK: H-B16 holds in all ${n} variants, checked with hand-encoded preimages and node:crypto (no Stellar SDK, no host code).`);
