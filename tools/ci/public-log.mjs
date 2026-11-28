#!/usr/bin/env node
// tools/ci/public-log.mjs <log>: print a run's output for a public CI log. CI logs on a public repository are
// public, and findings/policy.md says anything that halts or crashes an indexer, an SDK or stellar-core is reported
// privately first. So a line that names a crash, a halt, a stall, a timeout or a panic AND identifies what it happened
// on (an entry or variant id, a ledger number, a commit) is replaced by a notice; run the suite locally to see it.
// Counts such as "0 halted" and every other line (known results, other mismatches) are printed as they were.
import { readFileSync } from 'node:fs';
const SENSITIVE = /\b(crash(ed|es)?|halt(ed|s)?|stall(ed|s)?|time(d)?[ -]?out|panic(ked|s)?|SIGSEGV|segfault|fatal error)\b/i;
// an entry or variant id (muxed.payment.every-position@p30-mainnet-generated), a ledger number, a commit hash
const IDENTIFIES = /\b[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9.-]*(@[A-Za-z0-9._-]+)?|\b\d{6,}\b|\b[0-9a-f]{8,40}\b/;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
let withheld = 0;
for (const raw of readFileSync(process.argv[2], 'utf8').split('\n')) {
  const line = raw.replace(ANSI, '');
  if (SENSITIVE.test(line) && IDENTIFIES.test(line)) { withheld++; console.log('  [withheld: a crash, halt, stall or timeout result; see findings/policy.md and run it locally]'); }
  else console.log(raw);
}
if (withheld) console.log(`\n${withheld} line(s) withheld from this public log under findings/policy.md.`);
