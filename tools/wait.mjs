#!/usr/bin/env node
// wait.mjs <label> [status file]: one live row on stderr while a shell script works on something that prints
// nothing (installing pinned SDKs, building images), in the same look as every other live row (tools/ui.mjs).
// The script writes the step it is on to the status file ("building the Python image") and the row shows it;
// stop the row with kill, and it erases itself. Outside an interactive terminal it draws nothing.
//   node tools/wait.mjs "Preparing the SDK builds" .work/status & spin=$!   ...   kill $spin; wait $spin
import { readFileSync } from 'node:fs';
import { makeUI } from './ui.mjs';

const [label = 'Working', file] = process.argv.slice(2);
const ui = makeUI({ stream: process.stderr });
const row = ui.task(label);
let last = '';
setInterval(() => {
  if (!file) return;
  let step = '';
  try { step = readFileSync(file, 'utf8').trim(); } catch { /* not written yet */ }
  if (step !== last) { last = step; row.note(step); }
}, 150); // keeps the process alive until it is killed; ui.mjs erases the row on SIGTERM
