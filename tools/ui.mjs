// The one look for everything XDRProof prints ("proof stamps"). Every tool that reports results uses this file, and
// every recording of a run (README, docs, upstream issues) is a recording of this output.
//
//   XDRPROOF   conformance  · 6 builds on 634 corpus variants
//
//     js 17.4.0 ..................... 2,743   CHECKED
//     xdr-json 30.0.0 ............... 2,512   14 KNOWN
//         reported   js-stellar-xdr-json#67 ×13 · rs-stellar-xdr#622 ×1
//
//   CHECKED   every result as pre-registered                         1:02
//
// Rules:
//   - Every result ends in a stamp: neutral for a clean result (CHECKED, IDENTICAL), gold for a known, reported
//     problem (14 KNOWN, REPORTED #67) and for the closing verdict, rust for something wrong (MISHANDLED, UNEXPECTED).
//   - Dotted leaders run from the name to the number. Numbers are right-aligned and grouped (2,743).
//   - A problem gets short indented lines under its row: why, reported, rerun.
//   - The verdict is always the last line: a stamp, what was judged, and the time.
//   - IDs are terminal hyperlinks (OSC 8) where the terminal supports them: issues, ledgers, accounts, releases,
//     corpus entries (iTerm2, Ghostty, kitty, WezTerm, VS Code, the Claude desktop terminal). Elsewhere
//     (Terminal.app, CI logs) they are plain text, and the summary lists each one with its full URL above the
//     verdict, since those terminals and log viewers open full URLs written out.
//   - Colour and live progress only in an interactive terminal. A pipe, CI, TERM=dumb or NO_COLOR gives plain text
//     with [STAMP] brackets. FORCE_COLOR=1 forces colour; FORCE_HYPERLINK=1 or 0 forces links on or off.
//   - Something shows at once. The header prints as soon as the command knows what it is checking, and while the
//     work runs a live block on stderr names each part of it, one row each, the way the cards will:
//
//       ⠹ Corpus                 ━━━━━━━━━━━━━━━──────────  412/634  3.1s
//       ✓ Mined pubnet ledgers                                        1.2s
//       ◦ Keys and signatures                                      waiting
//
//     A spinner while a part runs, a bar when it can be counted, the step it is on when it cannot ("starting the
//     database"), and how long is left once that is worth saying. When the work is done the block is erased and
//     the cards print in its place.
//   - No dependencies: this file loads in a few milliseconds.

const env = process.env;

function colourLevel(stream) {
  if ('NO_COLOR' in env && env.NO_COLOR !== '') return 0;
  if (env.FORCE_COLOR === '0') return 0;
  const forced = env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0';
  if (!forced && (!stream.isTTY || env.TERM === 'dumb' || env.CI)) return 0;
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '') || /^(iTerm\.app|vscode|WezTerm|ghostty)$/.test(env.TERM_PROGRAM ?? '')) return 3;
  if (/256/.test(env.TERM ?? '')) return 2;
  return 1;
}

function linksOn(stream, level) {
  if (env.FORCE_HYPERLINK !== undefined) return env.FORCE_HYPERLINK !== '0';
  if (!level || !stream.isTTY) return false;
  // claude-desktop: the Claude desktop app's terminal panel (xterm.js), tested 23 Nov 2026: hidden links open on click
  if (/^(iTerm\.app|vscode|WezTerm|ghostty|Hyper|claude-desktop)$/.test(env.TERM_PROGRAM ?? '')) return true;
  if (/kitty|foot|alacritty/.test(env.TERM ?? '') || env.WT_SESSION || env.KITTY_WINDOW_ID) return true;
  return Number(env.VTE_VERSION ?? 0) >= 5000;
}

const SGR = (open, close) => (s) => `\x1b[${open}m${s}\x1b[${close}m`;
// Stamp colours: Stellar gold #FDDA24 and rust #B8410E, with 256-colour and 16-colour stand-ins.
const STAMP = {
  3: { gold: '48;2;253;218;36;38;2;21;19;15', fail: '48;2;184;65;14;38;2;250;247;242', pass: '38;2;46;125;79', known: '38;2;196;154;0', bad: '38;2;214;92;38' },
  2: { gold: '48;5;220;38;5;16', fail: '48;5;166;38;5;231', pass: '38;5;29', known: '38;5;178', bad: '38;5;166' },
  1: { gold: '43;30', fail: '41;97', pass: '32', known: '33', bad: '31' },
};

const EPIPE_HANDLED = Symbol('xdrproof.epipe'); // one handler per stream, however many makeUI() calls

export function makeUI({ stream = process.stdout, errStream = process.stderr } = {}) {
  const level = colourLevel(stream), links = linksOn(stream, level), live = level > 0 && errStream.isTTY;
  const C = STAMP[level] ?? null;
  const paint = (codes, s) => (C ? `\x1b[${codes}m${s}\x1b[0m` : s);
  const ui = {
    colour: level > 0,
    links,
    // the terminal's width (COLUMNS when not a terminal), kept between 40 and 120
    width: Math.max(40, Math.min(stream.columns || Number(env.COLUMNS) || 100, 120)),
    // plain text wrapped at spaces into lines of at most n characters (a longer word is cut), for problem lines:
    // on a narrow terminal the reason is the part that matters
    wrap: (t, n) => String(t).split(' ').reduce((ls, w) => { const l = ls[ls.length - 1]; if (l !== undefined && (l + ' ' + w).length <= n) ls[ls.length - 1] = l + ' ' + w; else ls.push(w.length > n ? w.slice(0, Math.max(1, n - 1)) + '…' : w); return ls; }, []),
    // plain text cut to n visible characters with an ellipsis
    trunc: (s, n) => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + '…'),
    bold: (s) => (C ? SGR(1, 22)(s) : s),
    dim: (s) => (C ? SGR(2, 22)(s) : s),
    pass: (s) => paint(C?.pass, s),
    known: (s) => paint(C?.known, s),
    bad: (s) => paint(C?.bad, s),
    // A stamp: ' WORD ' in a solid block, or [WORD] without colour. kind: neutral | gold | fail
    stamp(kind, word) {
      if (!C) return `[${word}]`;
      if (kind === 'gold') return paint(`1;${C.gold}`, ` ${word} `);
      if (kind === 'fail') return paint(`1;${C.fail}`, ` ${word} `);
      return `\x1b[1;7m ${word} \x1b[0m`;
    },
    // Visible width of a stamp, for alignment.
    stampWidth: (word) => word.length + 2,
    link(text, url) {
      if (!url || !links) return text;
      return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
    },
    // owner/repo#N (or a full GitHub issue URL) as a link to the issue.
    issue(ref) {
      const m = String(ref).match(/([\w.-]+)\/([\w.-]+)#(\d+)/);
      return m ? ui.link(`${m[2]}#${m[3]}`, `https://github.com/${m[1]}/${m[2]}/issues/${m[3]}`) : String(ref);
    },
    num: (n) => (typeof n === 'bigint' ? n : Number(n)).toLocaleString('en-US'), // a BigInt stays exact
    elapsed(ms) {
      const s = ms / 1000;
      return s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    },
    out(line = '') { stream.write(line + '\n'); },
    // meta may be a list, longest first: the first that fits the width is used (the last may be '')
    header(command, meta) { if (Array.isArray(meta)) meta = meta.find((m) => 10 + 2 + command.length + (m ? 4 + m.length : 0) < ui.width) ?? ''; ui.out(); ui.out(`${ui.stamp('neutral', 'XDRPROOF')}  ${ui.bold(command)}${meta ? ui.dim('  · ' + meta) : ''}`); ui.out(); },
    section(title) { ui.out(); ui.out('  ' + ui.dim(title)); },
    // name ......... value  STAMP  [after]; name and label may carry links, so pass their visible widths.
    row({ name, nameWidth = name.length, value = '', stamp, after = '', cols = 34 }) {
      const v = String(value), dots = Math.max(2, cols - nameWidth - v.length);
      ui.out(`  ${ui.bold(name)} ${ui.dim('.'.repeat(dots))}${v ? ' ' + ui.bold(v) : ''}  ${stamp ?? ''}${after ? '   ' + after : ''}`);
    },
    sub(label, text) { ui.out(`      ${ui.dim(label.padEnd(9))}  ${text}`); },
    verdict(kind, word, text, ms) {
      ui.clear(); ui.out();
      const time = ms === undefined ? '' : ui.elapsed(ms), lead = ui.stampWidth(word) + 2;
      // the stamp, then the words (wrapped under themselves when the terminal is narrow), then the time if it fits
      const lines = ui.wrap(text, Math.max(10, ui.width - lead));
      const last = lines.length - 1, withTime = time && lead + lines[last].length + 3 + time.length <= ui.width;
      lines.forEach((l, k) => ui.out(`${k ? ' '.repeat(lead) : ui.stamp(kind, word) + '  '}${ui.bold(l)}${k === last && withTime ? '   ' + ui.dim(time) : ''}`));
      if (time && !withTime) ui.out(' '.repeat(lead) + ui.dim(time));
      ui.out();
    },
    // a closing hint: "<label>:  <command>" when it fits the terminal, else "more:  <command>"
    hint(label, command) {
      const long = `${label}:  ${command}`;
      ui.out(`  ${ui.dim(long.length + 2 <= ui.width ? label + ':' : 'more:')}  ${command}`);
    },
    // ---- proof cards ----
    // A card: its title and score on the top edge, one row per line (mark ✓ passed, ! known and reported, ✗ wrong)
    // with an optional right part (a count, or a short link label with its url), a dim detail line under a row when
    // details is on, and the closing edge. As wide as the terminal allows, at most 64 columns; every line fits.
    // rank(): 0 when a line failed, 1 when one is a known problem, 2 when all passed (failures print first).
    rank: (lines) => (lines.some((l) => l.mark === '✗') ? 0 : lines.some((l) => l.mark === '!') ? 1 : 2),
    card({ title, score = '', lines, details = false, footer = '' }) {
      const C = Math.min(ui.width - 4, 64), INNER = C - 4, r = ui.rank(lines);
      const sc = r === 0 ? ui.bad(score) : r === 1 ? ui.known(score) : score;
      const t = ui.trunc(title, Math.max(4, C - 8 - (score ? score.length + 1 : 0)));
      const dashes = Math.max(1, C - 6 - t.length - (score ? score.length + 1 : 0));
      ui.out(`  ${ui.dim('╭─ ')}${ui.bold(t)}${ui.dim(' ' + '─'.repeat(dashes))}${score ? ' ' + sc : ''}${ui.dim('─╮')}`);
      for (const l of lines) {
        const mark = l.mark === '✓' ? ui.pass('✓') : l.mark === '!' ? ui.known('!') : ui.bad('✗');
        const right = String(l.right ?? ''), rw = right.length, room = INNER - 2 - (rw ? rw + 1 : 0), text = ui.trunc(l.text, room);
        const rr = !rw ? '' : ' ' + (l.url ? (l.mark === '!' ? ui.known(ui.link(right, l.url)) : ui.dim(ui.link(right, l.url))) : ui.dim(right));
        ui.out(`  ${ui.dim('│')} ${mark} ${text}${' '.repeat(Math.max(0, room - text.length))}${rr} ${ui.dim('│')}`);
        if (details && l.detail) for (const d of [].concat(l.detail)) ui.out(`  ${ui.dim('│')}   ${ui.dim(ui.trunc(d, INNER - 2).padEnd(INNER - 2))} ${ui.dim('│')}`);
      }
      if (footer) ui.out(`  ${ui.dim('│')} ${ui.dim(ui.trunc(footer, INNER).padEnd(INNER))} ${ui.dim('│')}`);
      ui.out(`  ${ui.dim('╰' + '─'.repeat(C - 2) + '╯')}`);
    },
    // ---- the live block (interactive terminals only; every call is a no-op elsewhere) ----
    // ui.task(label, { waiting, since }) adds a row and returns { count(done, total), note(text), start(), done(),
    // fail() }. since: when the work really began (a check started before its row existed), for its time.
    task(label, { waiting = false, since = Date.now() } = {}) {
      const row = { label, state: waiting ? 'wait' : 'run', t0: since, t1: 0, done: 0, total: 0, note: '' };
      const t = {
        start() { if (row.state === 'wait') { row.state = 'run'; row.t0 = Date.now(); } return t; },
        count(done, total) { t.start(); row.done = done; row.total = total; row.note = ''; return t; },
        // a note replaces the bar: the row says what it is doing now (count() brings the bar back)
        note(text) { t.start(); row.note = text; row.total = 0; row.done = 0; return t; },
        done() { row.state = 'ok'; row.t1 = Date.now(); paint_(); return t; },
        fail() { row.state = 'fail'; row.t1 = Date.now(); paint_(); return t; },
        // a synchronous redraw, for loops that hold the event loop (the spinner cannot turn on its own there)
        tick() { paint_(); return t; },
      };
      if (!live) return t;
      rows.push(row);
      if (!timer) { timer = setInterval(paint_, 100); timer.unref(); }
      paint_();
      return t;
    },
    // a line on stderr (a debug heartbeat) printed above the live block instead of through it
    err(l) { if (drawn) { erase_(); errStream.write(l + '\n'); paint_(); } else errStream.write(l + '\n'); },
    // the old one-line form: a single counted row
    progress(label, done, total) { if (!live) return; (bars.get(label) ?? bars.set(label, ui.task(label)).get(label)).count(done, total); },
    // erase the live block (before the result prints, and on every exit path)
    clear() {
      if (timer) { clearInterval(timer); timer = null; }
      erase_(); rows.length = 0; bars.clear();
      if (hidden) { errStream.write('\x1b[?25h'); hidden = false; }
    },
  };
  // ---- the live block's drawing ----
  const rows = [], bars = new Map(), SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  let timer = null, drawn = 0, frame = 0, hidden = false;
  const vis = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, '').length;
  const clock = (ms) => ui.elapsed(ms);
  const left = (ms) => (ms < 90e3 ? `${Math.round(ms / 1000)}s left` : `${Math.round(ms / 60e3)} min left`);
  function line(r, LW, BW) {
    const now = Date.now(), took = (r.t1 || now) - r.t0;
    const mark = r.state === 'ok' ? ui.pass('✓') : r.state === 'fail' ? ui.bad('✗') : r.state === 'wait' ? ui.dim('◦') : ui.known(SPIN[frame % SPIN.length]);
    const label = ui.trunc(r.label, LW).padEnd(LW);
    const room = BW - 4 - LW - 1;                                     // what is left right of the label
    let right;
    if (r.state === 'wait') right = ui.dim('waiting');
    else if (r.state === 'fail') right = ui.bad('failed');
    else if (r.state === 'ok') right = ui.dim(clock(took).padStart(5));
    else if (r.total) {
      const tot = ui.num(r.total), count = `${ui.num(r.done).padStart(tot.length)}/${tot}`; // fixed width: the bar must not jump
      // how long is left, once there is enough to go on and it is worth saying; otherwise how long so far
      const eta = r.done >= 3 && took > 5000 ? (took / r.done) * (r.total - r.done) : 0;
      const tail = (eta > 20000 ? left(eta) : clock(took)).padStart(5);
      const short = eta > 20000 ? (eta < 90e3 ? `${Math.round(eta / 1000)}s` : `${Math.round(eta / 60e3)}m`) : clock(took);
      const bw = room - count.length - tail.length - 2;
      // the right side always fits in its room (a wrapped row breaks the erase): bar, then count and time, then
      // count and a short time, then the count alone
      if (bw >= 6) { const k = Math.round((bw * r.done) / r.total); right = `${ui.known('━'.repeat(k))}${ui.dim('─'.repeat(bw - k))} ${count} ${ui.dim(tail)}`; }
      else right = [`${count} ${ui.dim(tail.trim())}`, `${count} ${ui.dim(short)}`, count, ui.trunc(count, room)].find((c) => vis(c) <= room);
    } else {
      const tail = clock(took).padStart(5), note = r.note && room - tail.length - 1 >= 4 ? ui.trunc(r.note, room - tail.length - 1) : '';
      right = `${ui.dim(note)}${note ? ' ' : ''}${ui.dim(tail)}`;
    }
    const pad = Math.max(1, room - vis(right));
    return `  ${mark} ${r.state === 'run' ? label : ui.dim(label)}${' '.repeat(pad)}${right}`;
  }
  function erase_() {
    if (!drawn) return;
    let s = '\r\x1b[2K';
    for (let i = 1; i < drawn; i++) s += '\x1b[1A\x1b[2K';
    errStream.write(s); drawn = 0;
  }
  function paint_() {
    if (!live || !rows.length) return;
    frame++;
    // the width is read every frame: the panel may be resized while it runs. Rows end one column short of it,
    // so a terminal never wraps them (a wrapped row would break the erase).
    const W = Math.max(40, Math.min(errStream.columns || ui.width, 120)), BW = Math.min(W - 2, 66);
    // the label keeps its room (down to 40 columns); the bar gives way first, then the count stays
    const LW = Math.min(Math.max(...rows.map((r) => r.label.length)), BW - 4 - 1 - 13);
    const text = rows.map((r) => line(r, LW, BW)).join('\n');
    erase_(); errStream.write(text); drawn = rows.length;
    if (!hidden) { errStream.write('\x1b[?25l'); hidden = true; }
  }
  // Output printed while the block is up goes above it: erase, print, redraw.
  const out0 = ui.out;
  ui.out = (l = '') => { if (drawn) { erase_(); out0(l); paint_(); } else out0(l); };
  // a reader that stops early (| head, | less then q) closes the pipe: end quietly, the way a shell tool does
  if (stream.on && !stream[EPIPE_HANDLED]) { stream[EPIPE_HANDLED] = true; stream.on('error', (e) => { if (e.code === 'EPIPE') { ui.clear(); process.exit(141); } throw e; }); }
  // never leave a hidden cursor or a half-drawn block behind, whatever ends the process
  if (live) {
    process.once('exit', () => ui.clear());
    // a signal ends the process without 'exit': erase here, then let the signal do what it would have done
    // (a tool's own handler, such as conformance stopping its workers, still runs after this one)
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { ui.clear(); if (!process.listenerCount(sig)) process.kill(process.pid, sig); });
  }
  return ui;
}
