#!/usr/bin/env node
// novelty.mjs [--details] [--json out.json]: leave-one-out novelty over the built corpus (entries/).
//
// Each entry's atoms (arms, enum members, hazards, sightings, (hazard, placement) pairs) are defined in atoms.mjs.
// An entry is REDUNDANT when every one of its atoms is also contributed by some other entry. That test does not
// depend on the order entries are read, unlike a greedy "does it add anything new" pass. Entries that keep only
// placement atoms are listed for review: their arms, enums, hazards and sightings all appear elsewhere, and the
// placement text has to name a different position (another op index, inside a fee bump, mainnet bytes).
// Exit status 1 when any entry is redundant.
import { writeFileSync } from 'node:fs';
import { loadEntries, entryAtoms } from './atoms.mjs';
import { makeUI } from './ui.mjs';

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const jsonOut = arg('--json'), DETAILS = process.argv.includes('--details') || process.argv.includes('-v');
const ui = makeUI(), T0 = Date.now();
const corpusError = (e) => { ui.clear(); for (const l of ui.wrap(e.message, ui.width - 4)) ui.out('  ' + ui.bad(l)); ui.verdict('fail', 'ERROR', 'Could not read the corpus', Date.now() - T0); process.exit(2); };
let entries;
try { entries = loadEntries(); } catch (e) { corpusError(e); }
const nVariants = entries.reduce((n, e) => n + e.variants.length, 0);
ui.header('novelty', [`${ui.num(entries.length)} entries · ${ui.num(nVariants)} ledger variants`, `${ui.num(entries.length)} entries`, '']);
const row = ui.task('Reading every entry').note('hashing transactions');
let atoms;
try { ({ atoms } = await entryAtoms(entries, { onProgress: (d, n) => row.count(d, n) })); }
catch (e) { row.fail(); corpusError(e); }
row.done();

const owners = new Map();
for (const set of atoms.values()) for (const a of set) owners.set(a, (owners.get(a) ?? 0) + 1);
const report = entries.map((e) => {
  const unique = [...atoms.get(e.id)].filter((a) => owners.get(a) === 1).sort();
  const structural = unique.filter((a) => !a.startsWith('P:'));
  return { id: e.id, atoms: atoms.get(e.id).size, unique: unique.length, structural, placements: unique.filter((a) => a.startsWith('P:')).map((a) => a.slice(2)) };
});
const redundant = report.filter((r) => r.unique === 0);
const placementOnly = report.filter((r) => r.unique > 0 && r.structural.length === 0);
const kinds = { U: 'arms', E: 'enum members', H: 'hazards', S: 'sightings', P: 'placements' };
const totals = Object.fromEntries(Object.entries(kinds).map(([k, n]) => [n, [...owners.keys()].filter((a) => a.startsWith(k + ':')).length]));
// Placement text is the author's claim, not a measurement. The sharpest review aid: entries whose structural atoms
// (arms, enums, hazards, sightings) all sit inside ONE other entry. Each such pair must differ in what the facts check.
const structural = (id) => [...atoms.get(id)].filter((a) => !a.startsWith('P:'));
const containedIn = new Map(placementOnly.map((r) => [r.id, entries.filter((f) => f.id !== r.id && structural(r.id).every((a) => atoms.get(f.id).has(a))).map((f) => f.id)]));
const contained = [...containedIn].filter(([, v]) => v.length);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ entries: entries.length, variants: nVariants, totals, contained: Object.fromEntries(contained), report }, null, 2) + '\n');

// ---- the card --------------------------------------------------------------------------------------------------
ui.clear();
const own = report.length - placementOnly.length - redundant.length, good = report.length - redundant.length, narrow = ui.width < 60;
const lines = [
  ...(redundant.length ? [{ mark: '✗', text: narrow ? `${redundant.length} add nothing new` : `${redundant.length} add nothing another entry lacks` }] : []),
  { mark: '✓', text: narrow ? `${own} hold something unique` : `${own} hold an arm, value, hazard or bug of their own` },
  { mark: '✓', text: narrow ? `${placementOnly.length} differ only by position` : `${placementOnly.length} differ only in where it sits in the ledger` },
];
ui.card({ title: narrow ? 'No entry repeats' : 'No entry repeats another', score: `${good}/${report.length}`, lines });
if (DETAILS) {
  // the entries told apart only by placement, each with its placements and, when one other entry holds all its
  // structure, that entry: their facts must check a different thing
  ui.out(); ui.out('  ' + ui.bold(`Told apart by where they sit (${placementOnly.length})`));
  for (const r of placementOnly) {
    ui.out('    ' + ui.trunc(r.id, ui.width - 4));
    if (containedIn.get(r.id).length) for (const l of ui.wrap(`inside ${containedIn.get(r.id).slice(0, 2).join(', ')}`, ui.width - 8)) ui.out('      ' + ui.dim(l));
    for (const pl of r.placements) for (const [k, l] of ui.wrap(pl, ui.width - 10).entries()) ui.out((k ? '        ' : '      ') + ui.dim(l));
  }
  ui.out();
  ui.wrap(`What the entries hold, ${ui.num(owners.size)} things in all: ${totals.arms} union arms, ${totals['enum members']} enum values, ${totals.hazards} hazards, ${totals.sightings} upstream bugs and ${totals.placements} placements. "inside" names the one other entry that holds everything else it has: their facts must check a different thing.`, ui.width - 4).forEach((l) => ui.out('  ' + ui.dim(l)));
}
if (redundant.length) {
  ui.out(); ui.out('  ' + ui.bold('Repeats another entry:'));
  for (const r of redundant) ui.out('    ' + ui.bad(ui.trunc(r.id, ui.width - 6)));
  ui.verdict('fail', 'FAILED', `${redundant.length} entr${redundant.length === 1 ? 'y adds' : 'ies add'} nothing new`, Date.now() - T0);
  process.exit(1);
}
ui.verdict('gold', 'PASSED', 'Every entry adds something.', Date.now() - T0);
if (!DETAILS) ui.hint(`the ${placementOnly.length} told apart by where they sit`, 'make novelty DETAILS=1');
