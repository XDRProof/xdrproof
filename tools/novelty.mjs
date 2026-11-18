#!/usr/bin/env node
// novelty.mjs [--json out.json]: leave-one-out novelty over the built corpus (entries/).
//
// Each entry's atoms (arms, enum members, hazards, sightings, (hazard, placement) pairs) are defined in atoms.mjs.
// An entry is REDUNDANT when every one of its atoms is also contributed by some other entry. That test does not
// depend on the order entries are read, unlike a greedy "does it add anything new" pass. Entries that keep only
// placement atoms are listed for review: their arms, enums, hazards and sightings all appear elsewhere, and the
// placement text has to name a different position (another op index, inside a fee bump, mainnet bytes).
// Exit status 1 when any entry is redundant.
import { writeFileSync } from 'node:fs';
import { loadEntries, entryAtoms } from './atoms.mjs';

const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const entries = loadEntries();
const { atoms, variants } = entryAtoms(entries);

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

console.log(`${entries.length} entries, ${variants} variants. Atoms in the corpus: ${Object.entries(totals).map(([n, c]) => `${c} ${n}`).join(', ')}.`);
console.log(`${report.length - placementOnly.length - redundant.length} entries hold an arm, enum member, hazard or sighting no other entry holds.`);
// Placement text is the author's claim, not a measurement. The sharpest review aid: entries whose structural atoms
// (arms, enums, hazards, sightings) all sit inside ONE other entry. Each such pair must differ in what the facts check.
const structural = (id) => [...atoms.get(id)].filter((a) => !a.startsWith('P:'));
const containedIn = new Map(placementOnly.map((r) => [r.id, entries.filter((f) => f.id !== r.id && structural(r.id).every((a) => atoms.get(f.id).has(a))).map((f) => f.id)]));
const contained = [...containedIn].filter(([, v]) => v.length);
if (placementOnly.length) {
  console.log(`\n${placementOnly.length} entries are told apart only by their placement (their arms, enums, hazards and sightings appear elsewhere);`);
  console.log(`${contained.length} of them are structurally contained in a single other entry (review: the facts must check a different thing):`);
  for (const r of placementOnly) console.log(`  ${r.id}${containedIn.get(r.id).length ? '   [contained in ' + containedIn.get(r.id).slice(0, 2).join(', ') + ']' : ''}\n      ${r.placements.join('\n      ')}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ entries: entries.length, variants, totals, contained: Object.fromEntries(contained), report }, null, 2) + '\n');
if (redundant.length) {
  console.log(`\nREDUNDANT (every atom is contributed by another entry):`);
  for (const r of redundant) console.log(`  ${r.id}`);
  process.exit(1);
}
console.log(`\nOK: no entry is redundant (leave-one-out over ${owners.size} atoms).`);
