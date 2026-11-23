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

export function makeUI({ stream = process.stdout, errStream = process.stderr } = {}) {
  const level = colourLevel(stream), links = linksOn(stream, level), live = level > 0 && errStream.isTTY;
  const C = STAMP[level] ?? null;
  const paint = (codes, s) => (C ? `\x1b[${codes}m${s}\x1b[0m` : s);
  const ui = {
    colour: level > 0,
    links,
    // the terminal's width (COLUMNS when not a terminal), kept between 40 and 120
    width: Math.max(40, Math.min(stream.columns || Number(env.COLUMNS) || 100, 120)),
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
    num: (n) => Number(n).toLocaleString('en-US'),
    elapsed(ms) {
      const s = ms / 1000;
      return s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    },
    out(line = '') { stream.write(line + '\n'); },
    header(command, meta) { ui.clear(); ui.out(); ui.out(`${ui.stamp('neutral', 'XDRPROOF')}  ${ui.bold(command)}${meta ? ui.dim('  · ' + meta) : ''}`); ui.out(); },
    section(title) { ui.out(); ui.out('  ' + ui.dim(title)); },
    // name ......... value  STAMP  [after]; name and label may carry links, so pass their visible widths.
    row({ name, nameWidth = name.length, value = '', stamp, after = '', cols = 34 }) {
      const v = String(value), dots = Math.max(2, cols - nameWidth - v.length);
      ui.out(`  ${ui.bold(name)} ${ui.dim('.'.repeat(dots))}${v ? ' ' + ui.bold(v) : ''}  ${stamp ?? ''}${after ? '   ' + after : ''}`);
    },
    sub(label, text) { ui.out(`      ${ui.dim(label.padEnd(9))}  ${text}`); },
    verdict(kind, word, text, ms) {
      ui.clear(); ui.out();
      const time = ms === undefined ? '' : ui.elapsed(ms);
      ui.out(`${ui.stamp(kind, word)}  ${ui.bold(text)}${time ? '   ' + ui.dim(time) : ''}`);
      ui.out();
    },
    // One live line on stderr while work runs (interactive terminals only).
    progress(label, done, total) {
      if (!live) return;
      const w = 24, k = total ? Math.round((w * done) / total) : 0;
      errStream.write(`\r\x1b[2K  ${ui.dim(label)} ${ui.known('━'.repeat(k))}${ui.dim('━'.repeat(w - k))} ${ui.dim(`${done}/${total}`)}`);
      ui._live = true;
    },
    clear() { if (ui._live) { errStream.write('\r\x1b[2K'); ui._live = false; } },
  };
  return ui;
}
