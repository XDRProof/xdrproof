#!/usr/bin/env node
// gen-enum-names.mjs: writes defs/sep0051-enum-names.json, the SEP-0051 JSON string for every XDR enum member
// (e.g. TransactionResultCode.txNO_ACCOUNT -> "tx_no_account"). The strings come from the JSON schema that
// stellar-xdr itself publishes (`stellar xdr types schema --type <Enum>`, stellar-cli 30.0.1 / stellar-xdr 30.0.0),
// listed in declaration order; they are paired with xdr.json's members by position, and the build fails unless
// every enum has the same number of members in both. The oracle uses the map to check enum-valued facts.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const defs = JSON.parse(readFileSync(join(HERE, 'defs/xdr-v30.0.json'), 'utf8')).definitions.filter((d) => d.kind === 'enum');
const out = {};
for (const d of defs) {
  // stellar-xdr's Rust names camel-case acronyms (ExtendFootprintTTLResultCode -> ExtendFootprintTtlResultCode)
  const rust = d.name.replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, (w) => w[0] + w.slice(1).toLowerCase());
  let schema;
  for (const name of [...new Set([d.name, rust])]) {
    try { schema = JSON.parse(execFileSync('stellar', ['xdr', 'types', 'schema', '--type', name], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); break; } catch { /* try the next spelling */ }
  }
  if (!schema) { console.error(`  no schema for ${d.name} or ${rust}; skipped`); continue; }
  const strings = schema.enum ?? (() => { throw new Error(`${d.name}: schema has no enum list`); })();
  if (strings.length !== d.members.length) throw new Error(`${d.name}: ${strings.length} schema strings vs ${d.members.length} members`);
  out[d.name] = Object.fromEntries(d.members.map((m, i) => [m.name, strings[i]]));
}
writeFileSync(join(HERE, 'defs/sep0051-enum-names.json'), JSON.stringify({ source: 'stellar xdr types schema (stellar-cli 30.0.1, stellar-xdr 30.0.0)', enums: out }, null, 1) + '\n');
console.log(`${Object.keys(out).length} of ${defs.length} enums mapped`);
