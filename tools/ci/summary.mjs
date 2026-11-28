#!/usr/bin/env node
// tools/ci/summary.mjs <conformance|replay> <log> <run-start-ms>: what a public CI log shows for a deep suite.
// CI logs on a public repository are public, and findings/policy.md says anything that halts or crashes an indexer,
// an SDK or stellar-core is reported privately first. A runner's own output can name the ledger or entry a crash
// happened on (sometimes across two lines), so it is never printed. This prints counts from the suite's structured
// results instead, in a fixed format: nothing in it comes from a ledger, an SDK's message or the log. To see which
// inputs failed, run the suite locally. If the suite left no results from this run (a build failed first), it prints
// the log's last lines with workflow commands switched off and any line naming a crash, halt or timeout withheld.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const [suite, log, start] = process.argv.slice(2);
const since = Number(start) || 0;
const fresh = (f) => existsSync(f) && statSync(f).mtimeMs >= since;
const n = (v) => (Number.isFinite(v) ? v : 0);

function conformance() {
  const f = 'conformance/.work/matrix.json';
  if (!fresh(f)) return false;
  const m = JSON.parse(readFileSync(f, 'utf8'));
  let unexpected = 0;
  console.log('conformance: results by build and family (pass / known / unexpected / not applicable)');
  for (const t of m.testees ?? []) {
    const parts = Object.entries(t.counts ?? {}).map(([fam, c]) => {
      unexpected += n(c.unexpected);
      return `${fam} ${n(c.pass)}/${n(c.expected)}/${n(c.unexpected)}/${n(c.na)}`;
    });
    console.log(`  ${String(t.name).replace(/[^\w.@-]/g, '?')}: ${parts.join(', ')}${t.depth_max != null ? `, deepest ${n(t.depth_max)} levels` : ''}`);
  }
  console.log(unexpected ? `conformance: ${unexpected} unexpected result(s). Run make conformance locally to see which.` : 'conformance: every result as expected.');
  return true;
}

function replay() {
  const f = 'replay/runs/wallet-backend@main/report.json';
  if (!fresh(f)) return false;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const counts = Object.entries(r.counts ?? {}).map(([k, v]) => `${n(v)} ${String(k).replace(/[^a-z_-]/gi, '?')}`).join(', ');
  console.log(`replay: wallet-backend ${String(r.ref ?? '').replace(/[^0-9a-f]/g, '').slice(0, 12)}, ${n(r.judged)} variants judged${r.partial ? ' (partial)' : ''}`);
  console.log(`  verdicts: ${counts || 'none'}`);
  console.log(`  mismatches with replay/expectations: ${n(r.mismatches?.length)}; harness errors: ${n(r.errors?.length)}`);
  // a harness or adapter error is XDRProof's own failure (reading the ledger, querying the indexer's database), never a
  // crash or halt of the indexer, so its message is shown, cleaned and cut short, to make CI failures debuggable
  const errs = (r.sessions ?? []).filter((x) => x.verdict === 'error').map((x) => ({ error: x.error
    ?? (x.failures ?? []).filter((f) => f.status === 'error').map((f) => `${f.kind}: ${f.got}`).join('; ') ?? 'no message' }));
  if (errs.length) {
    const token = randomBytes(16).toString('hex');
    console.log(`  harness or adapter errors (${errs.length}):`);
    console.log(`::stop-commands::${token}`);
    for (const x of errs.slice(0, 10)) console.log(`    ${String(x.error).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)}`);
    console.log(`::${token}::`);
  }
  if (r.harness_peak_rss_bytes) console.log(`  harness peak memory: ${Math.round(r.harness_peak_rss_bytes / 1048576)} MiB`);
  console.log(r.mismatches?.length || r.errors?.length ? 'replay: run make replay-main locally to see which variants.' : 'replay: every verdict as expected.');
  return true;
}

if (!{ conformance, replay }[suite]?.()) {
  // no results from this run: the suite stopped before judging anything. Its last lines are build output.
  const SENSITIVE = /\b(crash(ed|es)?|halt(ed|s)?|stall(ed|s)?|time(d)?[ -]?out|panic(ked|s)?|segfault)\b/i;
  const token = randomBytes(16).toString('hex');
  const lines = existsSync(log) ? readFileSync(log, 'utf8').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').split('\n').slice(-40) : [];
  console.log(`${suite}: no results from this run, so it stopped before judging anything. Its last lines:`);
  console.log(`::stop-commands::${token}`);
  for (const l of lines) console.log(SENSITIVE.test(l) ? '  [withheld under findings/policy.md]' : `  ${l}`);
  console.log(`::${token}::`);
}
