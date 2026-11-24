#!/usr/bin/env node
// inspect.mjs <lane> <step> [variant-label, default p30-mainnet]: authoring aid for catalog facts.
// Prints the focus transaction of a recipe step as the catalog addresses it: tx.result, tx.fee_charged, the
// envelope's operations, each operation's change kinds and events, and the tx-level meta sizes.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { makeUI } = await import('./ui.mjs');
const ui = makeUI();
const [lane, step, label = 'p30-mainnet'] = process.argv.slice(2);
const stop = (msg) => { ui.out('  ' + ui.bad(msg)); ui.out(); process.exit(1); };
if (!lane || !step) { ui.out('usage: node tools/inspect.mjs <classic|soroban> <step> [p<protocol>-<mainnet|testnet>[-<flags>]]'); process.exit(2); }
const m = label.match(/^p(\d+)-(mainnet|testnet)(?:-([a-z0-9]+))?$/);
if (!m) { ui.out(`not a run label: ${label} (for example p30-mainnet, p28-testnet, p30-mainnet-galexie)`); process.exit(2); }
ui.header('inspect', [`${lane} · ${step} · ${label}`, `${step} · ${label}`, '']);
const dir = join(ROOT, 'recipes', lane, 'runs', `g-${lane}-p${m[1]}-${m[2]}-${m[3] ?? 'base'}-1`);
if (!existsSync(join(dir, 'manifest.json'))) stop(`no run at recipes/${lane}/runs/${dir.split('/').pop()}: run make generate first`);
const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
let hit; for (const s of man.steps) { if (s.name === step) hit = { ledger: s.ledger, tx: s.tx }; for (const t of s.txs ?? []) if (t.label === step) hit = { ledger: s.ledger, tx: t.tx }; }
if (!hit) stop(`no step or transaction label "${step}" in that run's manifest`);
const json = JSON.parse(decode('LedgerCloseMeta', readFileSync(join(dir, 'lcm', `ledger-${String(hit.ledger).padStart(3, '0')}.xdr`))));
const arm = Object.keys(json)[0], L = json[arm];
// one labelled block: the label in the gutter, the text wrapped beside it
// on a narrow terminal the label goes on its own line and the text under it
const stacked = ui.width < 60, W = stacked ? ui.width - 6 : ui.width - 16;
const say = (label, text) => {
  if (stacked && label) ui.out('  ' + ui.dim(label));
  ui.wrap(String(text), W).forEach((l, k) => ui.out(stacked ? `    ${l}` : `  ${ui.dim((k ? '' : label).padEnd(12))}  ${l}`));
};
const short = (x, n = 400) => { const t = JSON.stringify(x); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
say('Ledger', `${hit.ledger} (LedgerCloseMeta ${arm}), ${L.tx_processing.length} transaction${L.tx_processing.length === 1 ? '' : 's'}`);
if (!hit.tx) { say('Upgrades', short(L.upgrades_processing ?? [], 300)); ui.out(); process.exit(0); }
const i = L.tx_processing.findIndex((t) => t.result.transaction_hash === hit.tx); const tp = L.tx_processing[i];
const meta = Object.values(tp.tx_apply_processing)[0];
say('Transaction', `tx_processing[${i}] · ${hit.tx}`);
say('Result', short(tp.result.result.result, 600));
say('Fee', `charged ${tp.result.result.fee_charged} · fee changes ${tp.fee_processing.length} · post-apply ${(tp.post_tx_apply_fee_processing ?? []).length}`);
say('Meta', `changes before ${meta.tx_changes_before.length} · after ${meta.tx_changes_after?.length} · events ${(meta.events ?? []).length} · diagnostic ${(meta.diagnostic_events ?? []).length}`);
(meta.operations ?? []).forEach((op, k) => {
  const kinds = op.changes.map((c) => { const [kd, x] = Object.entries(c)[0]; const d = kd === 'removed' ? x : x.data; const t = Object.keys(d)[0]; return `${kd}:${t}`; });
  say(`Op ${k}`, `changes [${kinds.join(', ')}] · events ${(op.events ?? []).length}`);
  if (op.events?.length) say('', `first event: ${short(op.events[0].body, 300)}`);
});
if (meta.soroban_meta) say('Soroban', short(meta.soroban_meta, 300));
ui.out();
