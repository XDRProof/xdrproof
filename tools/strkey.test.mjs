#!/usr/bin/env node
// Runs tools/strkey.mjs against every test vector in SEP-0023 ("Valid test cases" must decode and
// re-encode to themselves; "Invalid test cases" must be rejected).
// usage: node tools/strkey.test.mjs [--json] [path/to/sep-0023.md]   (default: the copy in tools/vectors/)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode } from './strkey.mjs';

const md = readFileSync(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), 'vectors/sep-0023.md'), 'utf8');
const section = (title) => md.split(`### ${title}`)[1].split(/\n### |\n## /)[0];
const keys = (text) => [...text.matchAll(/Strkey:?\s*`([A-Z2-7]+)`/gs)].map((m) => m[1]);
const JSON_OUT = process.argv.includes('--json'), problems = [];
const say = (line) => { problems.push(line); if (!JSON_OUT) console.log(line); };
let bad = 0;
const valid = keys(section('Valid test cases')), invalid = keys(section('Invalid test cases'));
for (const k of valid) {
  try { const { kind, payload } = decode(k); if (encode(kind, payload) !== k) throw new Error('re-encode'); }
  catch (e) { bad++; say(`REJECTED valid ${k.slice(0, 16)}…: ${e.message}`); }
}
for (const k of invalid) {
  try { const { kind } = decode(k); bad++; say(`ACCEPTED invalid ${k.slice(0, 16)}… as ${kind}`); } catch { /* expected */ }
}
// --json: one line for tools/verify.mjs, which prints every check together
if (JSON_OUT) console.log(JSON.stringify({ check: 'strkey', valid: valid.length, invalid: invalid.length, problems }));
else console.log(`SEP-0023: ${valid.length} valid accepted, ${invalid.length} invalid rejected, ${bad} wrong`);
process.exit(bad ? 1 : 0);
