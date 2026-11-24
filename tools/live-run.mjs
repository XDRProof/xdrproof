#!/usr/bin/env node
// live-run.mjs <label> -- <command...>: run a command that prints little or nothing while it works (the older
// make targets: xplint, the oracle, coverage, generate) with a live row under its output, in the look of every
// other live row (tools/ui.mjs): a spinner, the label, the last thing the command said, and the time so far.
// The command's own lines print above the row as they come. Its exit code is ours. Outside an interactive
// terminal it is a plain pass-through (same output, same exit code), so CI logs do not change.
//   node tools/live-run.mjs "xplint self-test" -- linter/go.sh sh -c '...'
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { makeUI } from './ui.mjs';

const argv = process.argv.slice(2), dash = argv.indexOf('--');
const label = argv.slice(0, Math.max(0, dash)).join(' ') || 'Working', cmd = argv.slice(dash + 1);
if (dash < 0 || !cmd.length) { console.error('usage: live-run.mjs <label> -- <command...>'); process.exit(2); }

const ui = makeUI();
const live = ui.colour && process.stderr.isTTY;
const p = live
  // piped, so its lines can print above the row; FORCE_COLOR keeps colour in tools that use it
  ? spawn(cmd[0], cmd.slice(1), { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' } })
  // pass-through: the command gets the terminal or the pipe exactly as it would without us
  : spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });
p.on('error', (e) => { ui.clear(); console.error(`live-run: ${cmd[0]}: ${e.message}`); process.exit(127); });

// Ctrl-C reaches the command from the terminal by itself (same process group). A SIGINT sent to us alone is passed
// on if the command is still running half a second later; a SIGTERM or SIGHUP is passed on at once. Either way we
// stay until the command has exited, then end as it did: with its exit code, or killed by the same signal.
let exited = false;
process.on('SIGINT', () => setTimeout(() => { if (!exited) p.kill('SIGINT'); }, 500).unref());
for (const sig of ['SIGTERM', 'SIGHUP']) process.on(sig, () => p.kill(sig));
p.on('close', (code, sig) => {
  exited = true; ui.clear();
  if (!sig) process.exit(code ?? 1);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeAllListeners(s);
  setTimeout(() => process.exit(128 + (constants.signals[sig] ?? 1)), 1000); // a signal Node ignores (SIGPIPE): exit 128+n
  process.kill(process.pid, sig);
});

if (live) {
  const row = ui.task(label);
  const plain = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim();
  const follow = (stream, print) => {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (c) => {
      buf += c;
      // each whole line prints above the row (as its last \r-redrawn state); the row shows the latest words
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '').split('\r').pop(); buf = buf.slice(i + 1);
        print(line); if (plain(line)) row.note(plain(line));
      }
      // a counter redrawn in place with \r, with no newline yet, only updates the row
      const partial = plain(buf.split('\r').pop()); if (partial) row.note(partial);
    });
    stream.on('end', () => { if (buf) print(buf.split('\r').pop()); });
  };
  follow(p.stdout, (l) => ui.out(l));
  follow(p.stderr, (l) => ui.err(l));
}
