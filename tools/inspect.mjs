#!/usr/bin/env node
// inspect.mjs <lane> <step> [variant-label, default p30-mainnet]: authoring aid for catalog facts.
// Prints the focus transaction of a recipe step as the catalog addresses it: tx.result, tx.fee_charged, the
// envelope's operations, each operation's change kinds and events, and the tx-level meta sizes.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [lane, step, label = 'p30-mainnet'] = process.argv.slice(2);
const m = label.match(/^p(\d+)-(mainnet|testnet)(?:-([a-z0-9]+))?$/);
const dir = join(ROOT, 'recipes', lane, 'runs', `g-${lane}-p${m[1]}-${m[2]}-${m[3] ?? 'base'}-1`);
const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
let hit; for (const s of man.steps) { if (s.name === step) hit = { ledger: s.ledger, tx: s.tx }; for (const t of s.txs ?? []) if (t.label === step) hit = { ledger: s.ledger, tx: t.tx }; }
if (!hit) { console.error('no such step'); process.exit(1); }
const json = JSON.parse(decode('LedgerCloseMeta', readFileSync(join(dir, 'lcm', `ledger-${String(hit.ledger).padStart(3, '0')}.xdr`))));
const arm = Object.keys(json)[0], L = json[arm];
console.log(`ledger ${hit.ledger} (${arm}), ${L.tx_processing.length} tx(s)`);
if (!hit.tx) { console.log('no transaction (ledger step)', JSON.stringify(L.upgrades_processing ?? []).slice(0, 300)); process.exit(0); }
const i = L.tx_processing.findIndex((t) => t.result.transaction_hash === hit.tx); const tp = L.tx_processing[i];
const meta = Object.values(tp.tx_apply_processing)[0];
const short = (x, n = 400) => JSON.stringify(x).slice(0, n);
console.log(`tx_processing[${i}] tx.result = ${short(tp.result.result.result, 600)}`);
console.log(`tx.fee_charged = ${tp.result.result.fee_charged}; fee_processing ${tp.fee_processing.length}; post_apply ${(tp.post_tx_apply_fee_processing ?? []).length}; before ${meta.tx_changes_before.length}; after ${meta.tx_changes_after?.length}; tx events ${(meta.events ?? []).length}; diagnostic ${(meta.diagnostic_events ?? []).length}`);
const envs = JSON.stringify(L.tx_set); // find the envelope by the result's hash is done by build; here show ops of all envelopes sharing a source is enough
(meta.operations ?? []).forEach((op, k) => {
  const kinds = op.changes.map((c) => { const [kd, x] = Object.entries(c)[0]; const d = kd === 'removed' ? x : x.data; const t = Object.keys(d)[0]; return `${kd}:${t}`; });
  console.log(`op ${k}: changes [${kinds.join(', ')}]; events ${(op.events ?? []).length}${op.events?.length ? ' first: ' + short(op.events[0].body, 300) : ''}`);
});
if (meta.soroban_meta) console.log('soroban_meta: ' + short(meta.soroban_meta, 300));
