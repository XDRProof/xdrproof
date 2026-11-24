// emulate.mjs: plays an asciicast v2 recording (tools/cast/record.py) through a small terminal and returns its
// screens over time, for every renderer (animated SVG, HTML player, GIF, MP4), so all of them show the same thing.
// It understands what XDRProof's tools print (tools/ui.mjs) and the common rest: text (wide and combining
// characters counted as terminals do), CR, LF with scrolling, SGR colour (16, 256 and true colour), bold, dim and
// inverse, erase in line and display (K, J), cursor moves (A B C D G H), cursor hide and show, and OSC 8 links. An
// escape cut between two recorded writes is completed by the next. Anything else is skipped.
//
//   import { load, play } from './emulate.mjs';
//   const cast = load('verify.cast');
//   const frames = play(cast, { maxIdle: 1.2, fps: 15 });   // [{ t, rows: [[run, ...], ...], cursor }]
//   a run: { text, fg, bg, bold, dim, inv, link } with fg/bg as '#rrggbb' or null (the theme's default)
import { readFileSync } from 'node:fs';

export function load(file) {
  const [head, ...rest] = readFileSync(file, 'utf8').trim().split('\n');
  return { header: JSON.parse(head), events: rest.map((l) => JSON.parse(l)).filter((e) => e[1] === 'o') };
}

const BASE16 = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff'];
const hex = (r, g, b) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
function c256(n) {
  if (n < 16) return BASE16[n];
  if (n < 232) { const v = [0, 95, 135, 175, 215, 255], i = n - 16; return hex(v[Math.floor(i / 36)], v[Math.floor(i / 6) % 6], v[i % 6]); }
  const g = 8 + (n - 232) * 10; return hex(g, g, g);
}

// How many cells a code point takes, as terminals count them: 0 for combining marks and joiners, 2 for wide East
// Asian characters and emoji, 1 for the rest.
export function cellWidth(cp) {
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || /\p{Mn}|\p{Me}/u.test(String.fromCodePoint(cp))) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x1f300 && cp <= 0x1f64f) || (cp >= 0x1f680 && cp <= 0x1f6ff) || (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

class Screen {
  constructor(cols, rows) { this.cols = cols; this.rows = rows; this.grid = Array.from({ length: rows }, () => []); this.x = 0; this.y = 0; this.cursor = true; this.pen = {}; this.link = null; this.rest = ''; }
  newline() { this.y++; if (this.y >= this.rows) { this.grid.shift(); this.grid.push([]); this.y = this.rows - 1; } }
  put(ch, w) {
    const row0 = this.grid[this.y];
    // a combining mark joins the character before it
    if (w === 0) { const prev = row0[this.x - 1]; if (prev) prev.ch += ch; return; }
    if (this.x + w > this.cols) { this.x = 0; this.newline(); }
    const row = this.grid[this.y];
    while (row.length < this.x) row.push(null);
    // a wide character's two cells go together: writing over either half blanks the other
    this.split(row, this.x); if (w === 2) this.split(row, this.x + 1);
    row[this.x++] = { ch, ...this.pen, link: this.link, ...(w === 2 ? { wide: true } : {}) };
    // the second cell of a wide character holds nothing of its own
    if (w === 2) row[this.x++] = { ch: '', cont: true, ...this.pen, link: this.link };
  }
  // before cell x changes: if it is half of a wide character, the other half becomes a blank (its own cell)
  split(row, x) {
    const c = row[x];
    if (c?.cont && row[x - 1]?.wide) row[x - 1] = null;
    if (c?.wide && row[x + 1]?.cont) row[x + 1] = null;
  }
  // a blank cell for an erase: empty, or carrying the current background (as terminals erase); a new object for
  // every cell, so a later change to one cell cannot show in another
  blank() { return this.pen.bg ? { ch: ' ', bg: this.pen.bg } : null; }
  eraseRow(y, from, to) { // inclusive range of columns
    const row = this.grid[y], end = Math.min(to, this.cols - 1);
    this.split(row, from); this.split(row, end);
    if (!this.pen.bg && end >= this.cols - 1) { row.length = Math.min(row.length, from); return; }
    while (row.length <= end) row.push(null);
    for (let k = from; k <= end; k++) row[k] = this.blank();
  }
  sgr(params) {
    const p = params.length ? params.map((v) => v ?? 0) : [0];
    for (let i = 0; i < p.length; i++) {
      const n = p[i];
      if (n === 0) this.pen = {};
      else if (n === 1) this.pen = { ...this.pen, bold: true };
      else if (n === 2) this.pen = { ...this.pen, dim: true };
      else if (n === 22) this.pen = { ...this.pen, bold: false, dim: false };
      else if (n === 7) this.pen = { ...this.pen, inv: true };
      else if (n === 27) this.pen = { ...this.pen, inv: false };
      else if (n === 39) this.pen = { ...this.pen, fg: null };
      else if (n === 49) this.pen = { ...this.pen, bg: null };
      else if ((n === 38 || n === 48) && p[i + 1] === 2) { this.pen = { ...this.pen, [n === 38 ? 'fg' : 'bg']: hex(p[i + 2], p[i + 3], p[i + 4]) }; i += 4; }
      else if ((n === 38 || n === 48) && p[i + 1] === 5) { this.pen = { ...this.pen, [n === 38 ? 'fg' : 'bg']: c256(p[i + 2]) }; i += 2; }
      else if (n >= 30 && n <= 37) this.pen = { ...this.pen, fg: BASE16[n - 30] };
      else if (n >= 90 && n <= 97) this.pen = { ...this.pen, fg: BASE16[n - 82] };
      else if (n >= 40 && n <= 47) this.pen = { ...this.pen, bg: BASE16[n - 40] };
      else if (n >= 100 && n <= 107) this.pen = { ...this.pen, bg: BASE16[n - 92] };
    }
  }
  csi(body, cmd) {
    const priv = body.startsWith('?'), p = body.replace(/^[?>=]/, '').split(';').map((x) => (x === '' ? undefined : Number(x)));
    const n1 = p[0] || 1, clampX = (x) => Math.max(0, Math.min(this.cols - 1, x)), clampY = (y) => Math.max(0, Math.min(this.rows - 1, y));
    if (cmd === 'm') this.sgr(body === '' ? [] : p);
    else if (cmd === 'K') { const m = p[0] ?? 0; if (m === 0) this.eraseRow(this.y, this.x, this.cols - 1); else if (m === 1) this.eraseRow(this.y, 0, this.x); else if (m === 2) this.eraseRow(this.y, 0, this.cols - 1); }
    else if (cmd === 'J') {
      const m = p[0] ?? 0;
      if (m === 2 || m === 3) for (let y = 0; y < this.rows; y++) this.eraseRow(y, 0, this.cols - 1);
      else if (m === 0) { this.eraseRow(this.y, this.x, this.cols - 1); for (let y = this.y + 1; y < this.rows; y++) this.eraseRow(y, 0, this.cols - 1); }
      else if (m === 1) { for (let y = 0; y < this.y; y++) this.eraseRow(y, 0, this.cols - 1); this.eraseRow(this.y, 0, this.x); }
    }
    else if (cmd === 'A') this.y = clampY(this.y - n1);
    else if (cmd === 'B') this.y = clampY(this.y + n1);
    else if (cmd === 'C') this.x = clampX(this.x + n1);
    else if (cmd === 'D') this.x = clampX(Math.min(this.x, this.cols - 1) - n1);
    else if (cmd === 'G') this.x = clampX((p[0] || 1) - 1);
    else if (cmd === 'H' || cmd === 'f') { this.y = clampY((p[0] || 1) - 1); this.x = clampX((p[1] || 1) - 1); }
    else if ((cmd === 'l' || cmd === 'h') && priv && p.includes(25)) this.cursor = cmd === 'h';
  }
  // Escape sequences may be cut between two recorded writes: an unfinished one is kept and completed by the next.
  write(input) {
    const s = this.rest + input; this.rest = '';
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (c === '\x1b') {
        const n = s[i + 1];
        if (n === undefined) { this.rest = s.slice(i); return; }
        if (n === '[') {
          let j = i + 2; while (j < s.length && !(s.charCodeAt(j) >= 0x40 && s.charCodeAt(j) <= 0x7e)) j++;
          if (j >= s.length) { this.rest = s.slice(i); return; }
          this.csi(s.slice(i + 2, j), s[j]); i = j + 1; continue;
        }
        if (n === ']') {
          // OSC: up to BEL or ST (ESC \); OSC 8 opens (with a url) or closes (empty) a link
          let j = i + 2, end = -1, stLen = 0;
          for (; j < s.length; j++) { if (s[j] === '\x07') { end = j; stLen = 1; break; } if (s[j] === '\x1b') { if (j + 1 >= s.length) break; if (s[j + 1] === '\\') { end = j; stLen = 2; break; } } }
          if (end < 0) { this.rest = s.slice(i); return; }
          const m = s.slice(i + 2, end).match(/^8;[^;]*;(.*)$/);
          if (m) this.link = m[1] || null;
          i = end + stLen; continue;
        }
        i += 2; continue; // a two-character escape: skipped
      }
      if (c === '\r') { this.x = 0; i++; continue; }
      if (c === '\n') { this.newline(); i++; continue; }
      if (c === '\b') { this.x = Math.max(0, this.x - 1); i++; continue; }
      const cp = s.codePointAt(i), ch = String.fromCodePoint(cp);
      if (cp >= 0x20 && cp !== 0x7f) this.put(ch, cellWidth(cp));
      i += ch.length;
    }
  }
  // the screen as rows of runs (adjacent cells with the same attributes joined); the second cell of a wide
  // character adds nothing to the text (its width is the character's)
  snapshot() {
    return this.grid.map((row) => {
      const runs = [];
      for (const cell of row) {
        const a = cell ?? { ch: ' ' };
        const last = runs[runs.length - 1];
        const same = last && last.fg === (a.fg ?? null) && last.bg === (a.bg ?? null) && !!last.bold === !!a.bold && !!last.dim === !!a.dim && !!last.inv === !!a.inv && last.link === (a.link ?? null);
        if (same) last.text += a.ch; else runs.push({ text: a.ch, fg: a.fg ?? null, bg: a.bg ?? null, bold: !!a.bold, dim: !!a.dim, inv: !!a.inv, link: a.link ?? null });
      }
      while (runs.length && !runs[runs.length - 1].text.trim() && !runs[runs.length - 1].bg && !runs[runs.length - 1].inv) runs.pop();
      return runs;
    });
  }
}

// Plays the recording: a frame after each burst of writes, at most fps frames a second; pauses longer than maxIdle
// seconds are shortened to maxIdle (the run is real, the waiting is not interesting). The last frame holds `hold`.
export function play(cast, { maxIdle = 1.2, fps = 15, hold = 3, speed = 1 } = {}) {
  const sc = new Screen(cast.header.width, cast.header.height), frames = [];
  let shift = 0, prev = 0, lastFrame = -1;
  const step = 1 / fps;
  cast.events.forEach(([t0, , data], i) => {
    let t = t0 - shift;
    if (t - prev > maxIdle) { shift += t - prev - maxIdle; t = prev + maxIdle; }
    prev = t;
    sc.write(data);
    const next = cast.events[i + 1], nextT = next ? next[0] - shift : Infinity;
    // a frame when the next write is far enough away, when a frame interval has passed since the last frame
    // (steady output is sampled, not lost), and always for the last write
    const due = step - 1e-6; // a little short of a whole interval, so 4/60 s counts as 1/15 s
    if (!next || nextT - t >= due || t / speed - lastFrame >= due) {
      const at = t / speed;
      if (frames.length && at - lastFrame < due) frames.pop();
      frames.push({ t: +at.toFixed(3), rows: sc.snapshot(), cursor: sc.cursor ? { x: sc.x, y: sc.y } : null });
      lastFrame = at;
    }
  });
  const end = (frames.at(-1)?.t ?? 0) + hold;
  return { cols: cast.header.width, rows: cast.header.height, title: cast.header.title, command: cast.header.command, recordedAt: cast.header.timestamp, exit: cast.header.exit, duration: end, frames };
}

// The rows actually used across all frames (the top and bottom ones a renderer must show).
export function usedRows(film) {
  let last = 0;
  for (const f of film.frames) f.rows.forEach((r, i) => { if (r.length) last = Math.max(last, i); });
  return last + 1;
}
