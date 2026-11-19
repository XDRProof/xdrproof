// XDRProof conformance testee (protocol 1) for @stellar/stellar-xdr-json: rs-stellar-xdr compiled to WASM, the
// decoder the JS ecosystem uses for SEP-0051 JSON. See conformance/README.md.
// usage: node testee.mjs <dir containing node_modules/@stellar/stellar-xdr-json>
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';

const dir = resolve(process.argv[2]);
const require = createRequire(join(dir, 'package.json'));
const x = await import(join(dir, 'node_modules/@stellar/stellar-xdr-json/stellar_xdr_json.js'));
x.initSync(readFileSync(join(dir, 'node_modules/@stellar/stellar-xdr-json/stellar_xdr_json_bg.wasm')));
const pkg = require('@stellar/stellar-xdr-json/package.json');
const err = (stage, e) => ({ status: 'error', error: { stage, message: String(e?.message ?? e).slice(0, 300) } });
const ops = {
  hello: () => ({ protocol: 1, implementation: { sdk: 'xdr-json', package: pkg.name, version: pkg.version, runtime: 'node ' + process.version }, ops: Object.keys(ops) }),
  decode: ({ type, xdr }) => {
    let json; try { json = JSON.parse(x.decode(type, xdr)); } catch (e) { return err('decode', e); }
    try { return { xdr: x.encode(type, JSON.stringify(json)), json }; } catch (e) { return err('encode', e); }
  },
  encode_json: ({ type, json }) => { try { return { xdr: x.encode(type, JSON.stringify(json)) }; } catch (e) { return err('encode', e); } },
};
createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line); let resp;
  try { resp = ops[req.op] ? ops[req.op](req.input || {}) : { status: 'unsupported', reason: 'not a decoder op' }; } catch (e) { resp = err('api', e); }
  process.stdout.write(JSON.stringify({ id: req.id, status: 'ok', ...resp }) + '\n');
});
