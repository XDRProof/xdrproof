// pool.mjs: fresh standalone stellar-core recipe runs, several at a time, and the child processes around them
// (shared by regenerate.mjs and order-scan.mjs).
//   job: { lane: 'classic'|'soroban', name, port, proto, net, flags }
// Each run is recipes/<lane>/trial.sh in its own process group: a fresh core in Docker, the recipe, one
// LedgerCloseMeta file per ledger in recipes/<lane>/runs/<name>/lcm, the container removed. The first failure stops
// the pool: no new run starts, the running ones are stopped and every container of the pool removed, the failed
// one's included. Ctrl-C, SIGTERM and SIGHUP stop everything this module started, at any stage of the command.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECIPES = dirname(fileURLToPath(import.meta.url));
const container = (j) => (j.lane === 'classic' ? `xdrproof-corpus-core-${j.name}` : `xdrproof-soroban-${j.name}`);

// ---- one stop path for the whole command ------------------------------------------------------------------
const stoppers = new Set();
let hooked = false;
const stopEverything = () => { for (const f of [...stoppers]) { try { f(); } catch {} } stoppers.clear(); };
function hook() {
  if (hooked) return; hooked = true;
  for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) process.once(sig, () => { stopEverything(); process.exit(128 + n); });
  process.once('exit', stopEverything);
}
const kill = (p) => { try { process.kill(-p.pid, 'SIGTERM'); } catch { try { p.kill('SIGTERM'); } catch {} } };

// A child process tracked until it exits (stopped with the command); resolves { code, out, err }.
export function child(cmd, args, opts = {}) {
  hook();
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => kill(p); stoppers.add(stop);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { stoppers.delete(stop); resolve({ code: -1, out, err: err + e.message }); });
    p.on('close', (code, signal) => { stoppers.delete(stop); resolve({ code: code ?? 128, signal, out, err }); });
  });
}

// the recipes' own packages, installed once (the shell version did the same)
export async function installOnce(onNote = () => {}) {
  for (const d of ['classic', 'soroban/gen', '../tools']) {
    if (existsSync(join(RECIPES, d, 'node_modules'))) continue;
    onNote(`installing packages in recipes/${d} (once)`);
    const r = await child('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: join(RECIPES, d) });
    if (r.code !== 0) throw new Error(`npm install failed in recipes/${d}: ${r.err.trim().split('\n').pop() ?? ''}`);
  }
}

// Runs every job, `par` at a time. onDone(job) after each success. Resolves when all succeeded; rejects with
// { job, output, log } on the first failure, after stopping the rest.
export function runTrials(jobs, { par = 6, onDone = () => {} } = {}) {
  hook();
  const queue = [...jobs], running = new Map();
  let stopped = false;
  const removeContainers = (list) => { for (const j of list) { try { execFileSync('docker', ['rm', '-f', container(j)], { stdio: 'ignore' }); } catch {} } };
  const stopAll = (failed = null) => {
    stopped = true; queue.length = 0;
    for (const p of running.keys()) kill(p);
    removeContainers([...running.values(), ...(failed ? [failed] : [])]);
    running.clear();
  };
  stoppers.add(stopAll);
  return new Promise((resolve, reject) => {
    const next = () => {
      if (stopped) return;
      if (!queue.length && !running.size) { stoppers.delete(stopAll); resolve(); return; }
      while (running.size < par && queue.length) {
        const j = queue.shift();
        const args = [join(RECIPES, j.lane, 'trial.sh'), j.name, String(j.port), ...(j.lane === 'soroban' ? [String(j.proto)] : [])];
        const p = spawn('bash', args, { cwd: RECIPES, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NET: j.net, FLAGS: j.flags } });
        let output = '';
        const keep = (d) => { output = (output + d).slice(-4000); };
        p.stdout.on('data', keep); p.stderr.on('data', keep);
        running.set(p, j);
        p.on('close', (code) => {
          if (stopped || !running.has(p)) return;
          running.delete(p);
          if (code !== 0) { stopAll(j); stoppers.delete(stopAll); reject({ job: j, output: output.trim(), log: join('recipes', j.lane, 'runs', j.name, 'gen.log') }); return; }
          onDone(j); next();
        });
      }
    };
    next();
  });
}
