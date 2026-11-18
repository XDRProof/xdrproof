#!/usr/bin/env node
// shipped-checks.mjs <lane> <protocol> <net> <flags>
//   Prints the compare.mjs checks (<entry-id>@<variant-key>=ledger-NNN.xdr) for every shipped generated variant
//   that a run of this configuration reproduces, read from entries/*/entry.json.
// shipped-checks.mjs --assigned "<lane> <protocol> <net> <flags>" ...
//   Fails unless every shipped generated variant belongs to one of the listed run configurations.
// Strict: a generated variant whose key or recipe path cannot be placed is an error, never a silent skip.
// Lane comes from the recipe path (recipes/classic/ or recipes/soroban/); protocol, network and emitter-flag
// profile from the key (p<proto>-<net>-generated[-<flags>]; no suffix means the base profile).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error(`shipped-checks: ${msg}`); process.exit(1); };
const generated = [];
for (const id of readdirSync(join(ROOT, 'entries')).filter((d) => statSync(join(ROOT, 'entries', d)).isDirectory()).sort()) {
  const entry = JSON.parse(readFileSync(join(ROOT, 'entries', id, 'entry.json'), 'utf8'));
  for (const v of entry.variants) {
    if (v.source?.lane !== 'generated' && !/-generated(-|$)/.test(v.key)) continue;
    const m = v.key.match(/^p(\d+)-(mainnet|testnet)-generated(?:-([a-z0-9]+))?$/);
    if (!m) fail(`${id}@${v.key}: generated variant key not of the form p<proto>-<mainnet|testnet>-generated[-<flags>]`);
    const lane = String(v.source?.recipe ?? '').match(/^recipes\/(classic|soroban)\//)?.[1];
    if (!lane) fail(`${id}@${v.key}: recipe path ${JSON.stringify(v.source?.recipe)} names no known lane`);
    if (!Number.isInteger(v.source?.ledger_seq)) fail(`${id}@${v.key}: no ledger_seq`);
    generated.push({ id, key: v.key, lane, proto: m[1], net: m[2], flags: m[3] ?? 'base', ledger: v.source.ledger_seq });
  }
}
const cfg = (g) => `${g.lane} ${g.proto} ${g.net} ${g.flags}`;
const args = process.argv.slice(2);
if (args[0] === '--assigned') {
  const runs = new Set(args.slice(1).map((s) => s.trim().split(/\s+/).join(' ')));
  const missing = generated.filter((g) => !runs.has(cfg(g)));
  for (const g of missing) console.log(`  not reproduced by any run in this matrix: ${g.id}@${g.key} (${cfg(g)})`);
  console.log(`  ${generated.length - missing.length} of ${generated.length} shipped generated variants assigned to a run`);
  process.exit(missing.length ? 1 : 0);
}
if (args.length !== 4) fail('usage: shipped-checks.mjs <lane> <protocol> <net> <flags> | --assigned "<cfg>" ...');
console.log(generated.filter((g) => cfg(g) === args.join(' ')).map((g) => `${g.id}@${g.key}=ledger-${String(g.ledger).padStart(3, '0')}.xdr`).join(' '));
