#!/usr/bin/env node
// tools/ci/summary.mjs <conformance|replay> <log> <run-start-ms>: what a public CI log shows for a deep suite.
// CI logs on a public repository are public, and findings/policy.md says anything that halts or crashes an indexer,
// an SDK or stellar-core is reported privately first. A runner's own output can name the ledger or entry a crash
// happened on (sometimes across two lines), so it is never printed. This prints counts from the suite's structured
// results instead, in a fixed format: nothing in it comes from a ledger, an SDK's message or the log. To see which
// inputs failed, run the suite locally. If the suite left no results from this run, it says so and nothing more.
import { readFileSync, existsSync, statSync } from 'node:fs';

const [suite, , start] = process.argv.slice(2);
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
  // the runner's own total also counts failures outside the family counts (a wrong SDK version, a missing check)
  const total = Number.isFinite(m.unexpected) ? m.unexpected : unexpected;
  console.log(total ? `conformance: ${total} unexpected result(s). Run make conformance locally to see which.` : 'conformance: every result as expected.');
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
  // a harness or adapter error is XDRProof's own failure, but its message can still name a variant, a database or a
  // ledger, and an error session can follow an indexer crash, so only fixed categories and their counts are shown
  const CATS = [['reading or deriving the ledger', /^harness:|derive|decode|native/i], ['the adapter reading the cursor', /cursor/i],
    ['the adapter reading the database', /observe|probe|database|sql|psql/i], ['a time limit', /time ?out|timed out|limit/i]];
  const cats = {};
  for (const x of (r.sessions ?? []).filter((y) => y.verdict === 'error')) {
    const text = [x.error ?? '', ...(x.failures ?? []).filter((f) => f.status === 'error').map((f) => `${f.kind} ${f.got}`)].join(' ');
    const cat = CATS.find(([, re]) => re.test(text))?.[0] ?? 'other';
    cats[cat] = (cats[cat] ?? 0) + 1;
  }
  if (Object.keys(cats).length) console.log(`  harness or adapter errors: ${Object.entries(cats).map(([k, v]) => `${v} while ${k}`).join(', ')}`);
  if (r.harness_peak_rss_bytes) console.log(`  harness peak memory: ${Math.round(r.harness_peak_rss_bytes / 1048576)} MiB`);
  console.log(r.mismatches?.length || r.errors?.length ? 'replay: run make replay-main locally to see which variants.' : 'replay: every verdict as expected.');
  return true;
}

if (!{ conformance, replay }[suite]?.()) {
  // no results from this run: it stopped before judging anything (a build, a control ledger or the setup failed).
  // The log is not shown: a control that halts stops the run before its report, and the log names it.
  const target = suite === 'replay' ? 'replay-main' : suite;
  console.log(`${suite}: no results from this run; it stopped before judging anything. Run make ${target} locally to see why.`);
}
